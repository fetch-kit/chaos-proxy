import type { Context, Middleware } from 'koa';
import http from 'http';
import https from 'https';
import Koa from 'koa';
import Router from '@koa/router';

import type { ChaosConfig } from './config/loader';
import { resolveConfigMiddlewares, validateConfigObject } from './config/parser';
import { shutdownAllTelemetryExporters } from './telemetry';
import {
  createRequestId,
  emitVerbose,
  extractTraceId,
  redactUrlQuery,
} from './logging/verbose';

type RuntimeState = {
  config: ChaosConfig;
  chaosChain: Middleware[];
  version: number;
};

type ReloadResult =
  | { ok: true; version: number; reloadMs: number }
  | { ok: false; error: string; statusCode: number; version: number; reloadMs: number };

type StartServerOptions = {
  verbose?: boolean;
  configPath?: string;
};

export type ChaosProxyServer = http.Server & {
  reloadConfig: (newConfigInput: unknown) => Promise<ReloadResult>;
  getRuntimeVersion: () => number;
};

const MAX_RELOAD_BODY_BYTES = 1024 * 1024;

function registerRouteMiddlewares(router: Router, routes: Record<string, Middleware[]>) {
  for (const [routeKey, middlewares] of Object.entries(routes)) {
    const methodPathMatch = routeKey.match(/^([A-Z]+)\s+(.+)$/i);
    if (methodPathMatch && methodPathMatch[1] && methodPathMatch[2]) {
      const method = methodPathMatch[1].toLowerCase();
      const path = methodPathMatch[2];
      type RouterMethod = (path: string, ...middleware: Array<Koa.Middleware>) => Router;
      const methodMap: Record<string, RouterMethod> = {
        get: router.get.bind(router),
        post: router.post.bind(router),
        put: router.put.bind(router),
        delete: router.delete.bind(router),
        patch: router.patch.bind(router),
        head: router.head.bind(router),
        options: router.options.bind(router),
      };
      const routeMethod = methodMap[method];
      if (!routeMethod) {
        throw new Error(`Unsupported HTTP method: ${method}`);
      }
      routeMethod(path, ...middlewares);
    } else {
      // Mount for all HTTP methods if no method is specified
      const methods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];
      for (const method of methods) {
        (router[method as keyof typeof router] as (path: string, ...middleware: Array<Koa.Middleware>) => Router)(routeKey, ...middlewares);
      }
    }
  }
}

function buildRuntimeState(configInput: unknown, version: number): RuntimeState {
  const config = validateConfigObject(configInput);
  const { global, routes } = resolveConfigMiddlewares(config);
  const router = new Router();
  registerRouteMiddlewares(router, routes);

  // Router middlewares use a richer ctx type; adapt them to the generic Koa middleware type.
  const routeDispatcher: Middleware = async (ctx, next) => {
    await (router.routes() as unknown as Middleware)(ctx, next);
  };
  const allowedMethods: Middleware = async (ctx, next) => {
    await (router.allowedMethods() as unknown as Middleware)(ctx, next);
  };

  return {
    config,
    chaosChain: [...global, routeDispatcher, allowedMethods],
    version,
  };
}

async function readJsonBody(ctx: Context): Promise<unknown> {
  const contentType = String(ctx.request.headers['content-type'] || '');
  if (!contentType.toLowerCase().includes('application/json')) {
    const err = new Error('Reload endpoint expects Content-Type: application/json');
    (err as Error & { statusCode?: number }).statusCode = 415;
    throw err;
  }

  const chunks: Buffer[] = [];
  let total = 0;
  await new Promise<void>((resolve, reject) => {
    ctx.req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_RELOAD_BODY_BYTES) {
        reject(new Error(`Reload payload too large (max ${MAX_RELOAD_BODY_BYTES} bytes)`));
        return;
      }
      chunks.push(chunk);
    });
    ctx.req.on('end', () => resolve());
    ctx.req.on('error', (err) => reject(err));
  });

  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`Invalid JSON body: ${(e as Error).message}`, { cause: e });
  }
}

async function runMiddlewareChain(
  ctx: Context,
  middlewares: Middleware[],
  finalHandler: () => Promise<void>
): Promise<void> {
  let index = -1;

  const dispatch = async (i: number): Promise<void> => {
    if (i <= index) {
      throw new Error('next() called multiple times');
    }
    index = i;

    if (i === middlewares.length) {
      await finalHandler();
      return;
    }

    const mw = middlewares[i];
    if (!mw) {
      return;
    }
    await mw(ctx, () => dispatch(i + 1));
  };

  await dispatch(0);
}

async function proxyRequest(
  ctx: Context,
  target: string,
  httpAgent: http.Agent,
  httpsAgent: https.Agent,
  options?: StartServerOptions
): Promise<void> {
  const targetUrl = new URL(target + ctx.url);
  const isHttps = targetUrl.protocol === 'https:';
  const proxyModule = isHttps ? https : http;

  // Hop-by-hop headers must not be forwarded
  const HOP_BY_HOP = new Set([
    'transfer-encoding', 'connection', 'keep-alive',
    'upgrade', 'proxy-connection', 'te', 'trailers',
  ]);

  // Build request headers from ctx.request.headers (may have been mutated by headerTransform)
  const headers: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(ctx.request.headers)) {
    if (typeof value === 'string' || Array.isArray(value)) headers[key] = value;
  }
  delete headers.host;
  headers.host = targetUrl.host;

  // If body was parsed (e.g. by bodyTransform), serialize it for the upstream request
  // instead of piping the already-drained ctx.req stream.
  let requestBodyBuffer: Buffer | undefined;
  if (ctx.request.body !== undefined) {
    const serialized = typeof ctx.request.body === 'string'
      ? ctx.request.body
      : JSON.stringify(ctx.request.body);
    requestBodyBuffer = Buffer.from(serialized, 'utf8');
    headers['content-length'] = String(requestBodyBuffer.length);
  }

  await new Promise<void>((resolve) => {
    let settled = false;
    let proxyResRef: http.IncomingMessage | null = null;
    const cleanup: Array<() => void> = [];
    const settle = () => {
      if (!settled) {
        settled = true;
        for (const fn of cleanup) fn();
        resolve();
      }
    };

    const proxyReq = proxyModule.request({
      protocol: targetUrl.protocol,
      hostname: targetUrl.hostname,
      port: targetUrl.port || (isHttps ? 443 : 80),
      path: targetUrl.pathname + targetUrl.search,
      method: ctx.method,
      headers,
      agent: isHttps ? httpsAgent : httpAgent,
    }, (proxyRes) => {
      proxyResRef = proxyRes;
      ctx.status = proxyRes.statusCode || 500;
      // Copy response headers (skip hop-by-hop so Koa can manage them)
      for (const [key, value] of Object.entries(proxyRes.headers)) {
        if (!HOP_BY_HOP.has(key.toLowerCase()) && value !== undefined) {
          ctx.set(key, value as string | string[]);
        }
      }
      // Detect if response is streaming (chunked, SSE, or no content-length).
      // If so, pipe directly; otherwise buffer for middleware transforms.
      const isStream =
        !proxyRes.headers['content-length'] &&
        (proxyRes.headers['transfer-encoding'] === 'chunked' ||
         (proxyRes.headers['content-type'] ?? '').startsWith('text/event-stream'));
      ctx.state.isStream = isStream;

      if (isStream) {
        // Stream mode: pipe upstream directly to response, skip buffering.
        // Settle immediately; Koa will handle async streaming.
        ctx.body = proxyRes;
        proxyRes.once('error', (err) => {
          emitVerbose(options?.verbose, 'verbose.error', {
            req_id: String(ctx.state.verboseRequestId || 'unknown'),
            class: 'upstream_response_error',
            status: 502,
            message: (err as Error).message,
          }, 'ERROR');
          ctx.status = 502;
          ctx.body = (err as Error).message;
        });
        settle();
      } else {
        // Buffered mode: collect chunks so downstream transforms (bodyTransform, headerTransform)
        // can intercept ctx.body before Koa sends the response.
        const chunks: Buffer[] = [];
        proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
        proxyRes.on('end', () => {
          const body = Buffer.concat(chunks);
          if (body.length > 0) {
            ctx.body = body;
          }
          settle();
        });
        proxyRes.on('error', (err) => {
          emitVerbose(options?.verbose, 'verbose.error', {
            req_id: String(ctx.state.verboseRequestId || 'unknown'),
            class: 'upstream_response_error',
            status: 502,
            message: (err as Error).message,
          }, 'ERROR');
          ctx.status = 502;
          ctx.body = (err as Error).message;
          settle();
        });
      }
    });

    proxyReq.on('error', (err) => {
      emitVerbose(options?.verbose, 'verbose.error', {
        req_id: String(ctx.state.verboseRequestId || 'unknown'),
        class: 'upstream_request_error',
        status: 502,
        message: (err as Error).message,
      }, 'ERROR');
      ctx.status = 502;
      ctx.body = (err as Error).message;
      settle();
    });

    // If downstream client aborts/disconnects, cancel upstream work too.
    const onClientAbort = () => {
      if (settled) return;
      proxyReq.destroy();
      if (proxyResRef) {
        proxyResRef.destroy();
      }
      settle();
    };
    ctx.req.once('aborted', onClientAbort);
    ctx.res.once('close', onClientAbort);
    cleanup.push(() => ctx.req.off('aborted', onClientAbort));
    cleanup.push(() => ctx.res.off('close', onClientAbort));

    // Send request body: use the (possibly transformed) parsed body if available,
    // otherwise fall back to piping the raw request stream.
    if (requestBodyBuffer !== undefined) {
      proxyReq.end(requestBodyBuffer);
    } else {
      ctx.req.pipe(proxyReq);
    }
  });
}

export function startServer(config: ChaosConfig, options?: StartServerOptions) {
  const app = new Koa();
  const httpAgent = new http.Agent({ keepAlive: true });
  const httpsAgent = new https.Agent({ keepAlive: true });
  let runtimeState = buildRuntimeState(config, 1);
  let isReloading = false;

  const reloadConfig = async (newConfigInput: unknown): Promise<ReloadResult> => {
    if (isReloading) {
      emitVerbose(options?.verbose, 'verbose.reload.end', {
        ok: false,
        old_version: runtimeState.version,
        new_version: runtimeState.version,
        reload_ms: 0,
        error: 'Reload already in progress',
      }, 'WARN');
      return {
        ok: false,
        error: 'Reload already in progress',
        statusCode: 409,
        version: runtimeState.version,
        reloadMs: 0,
      };
    }

    isReloading = true;
    const startedAt = Date.now();
    emitVerbose(options?.verbose, 'verbose.reload.begin', {
      current_version: runtimeState.version,
    });
    try {
      // Yield once so overlapping reload requests can observe the in-progress lock.
      await Promise.resolve();
      const nextState = buildRuntimeState(newConfigInput, runtimeState.version + 1);
      runtimeState = nextState;
      const reloadMs = Date.now() - startedAt;
      emitVerbose(options?.verbose, 'verbose.reload.end', {
        ok: true,
        old_version: runtimeState.version - 1,
        new_version: runtimeState.version,
        reload_ms: reloadMs,
      });
      return {
        ok: true,
        version: runtimeState.version,
        reloadMs,
      };
    } catch (e) {
      const reloadMs = Date.now() - startedAt;
      emitVerbose(options?.verbose, 'verbose.reload.end', {
        ok: false,
        old_version: runtimeState.version,
        new_version: runtimeState.version,
        reload_ms: reloadMs,
        error: (e as Error).message,
      }, 'WARN');
      return {
        ok: false,
        error: (e as Error).message,
        statusCode: 400,
        version: runtimeState.version,
        reloadMs,
      };
    } finally {
      isReloading = false;
    }
  };

  app.use(async (ctx: Context) => {
    if (ctx.path === '/reload' && ctx.method.toUpperCase() === 'POST') {
      try {
        const payload = await readJsonBody(ctx);
        const reloadResult = await reloadConfig(payload);
        ctx.status = reloadResult.ok ? 200 : reloadResult.statusCode;
        if (reloadResult.ok) {
          ctx.body = {
            ok: true,
            version: reloadResult.version,
            reloadMs: reloadResult.reloadMs,
          };
        } else {
          ctx.body = {
            ok: false,
            error: reloadResult.error,
            version: reloadResult.version,
            reloadMs: reloadResult.reloadMs,
          };
        }
      } catch (e) {
        const err = e as Error & { statusCode?: number };
        ctx.status = err.statusCode ?? 400;
        ctx.body = {
          ok: false,
          error: err.message,
          version: runtimeState.version,
          reloadMs: 0,
        };
      }
      return;
    }

    const snapshot = runtimeState;
    const requestId = createRequestId();
    const startedAt = Date.now();
    const redactedPath = redactUrlQuery(ctx.url);
    ctx.state.verboseRequestId = requestId;
    emitVerbose(options?.verbose, 'verbose.request.begin', {
      req_id: requestId,
      trace_id: extractTraceId(ctx.req.headers),
      method: ctx.method,
      path: redactedPath,
      target: snapshot.config.target,
      version: snapshot.version,
      middleware_count: snapshot.chaosChain.length,
    });

    ctx.state.proxyTarget = snapshot.config.target;
    try {
      await runMiddlewareChain(ctx, snapshot.chaosChain, async () => {
        await proxyRequest(ctx, snapshot.config.target, httpAgent, httpsAgent, options);
      });
    } catch (error) {
      emitVerbose(options?.verbose, 'verbose.error', {
        req_id: requestId,
        class: 'middleware_chain_error',
        status: 500,
        message: (error as Error).message,
      }, 'ERROR');
      throw error;
    } finally {
      const status = ctx.status || 500;
      emitVerbose(options?.verbose, 'verbose.request.end', {
        req_id: requestId,
        method: ctx.method,
        path: redactedPath,
        status,
        duration_ms: Date.now() - startedAt,
        result: status >= 500 ? 'error' : status >= 400 ? 'client_error' : 'ok',
      }, status >= 500 ? 'WARN' : 'INFO');
    }
  });

  const server = app.listen(config.port ?? 5000, () => {
    console.log(`Chaos Proxy listening on port ${config.port ?? 5000} -> target ${config.target}`);
    emitVerbose(options?.verbose, 'verbose.startup', {
      config_path: options?.configPath || 'chaos.yaml',
      listen_port: config.port ?? 5000,
      target: config.target,
      otel_enabled: Boolean(config.otel),
    });
  });

  server.on('close', () => {
    emitVerbose(options?.verbose, 'verbose.shutdown', {
      signal: 'server.close',
      in_flight: 0,
    });
    httpAgent.destroy();
    httpsAgent.destroy();
    shutdownAllTelemetryExporters().catch((err: unknown) => {
      console.error('[chaos-proxy telemetry] Failed to shutdown exporters:', err);
    });
  });

  const reloadableServer = server as ChaosProxyServer;
  reloadableServer.reloadConfig = reloadConfig;
  reloadableServer.getRuntimeVersion = () => runtimeState.version;

  return reloadableServer;
}
