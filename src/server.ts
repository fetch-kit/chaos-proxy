import type { Context } from 'koa';
import http from 'http';
import https from 'https';
import Koa from 'koa';
import Router from '@koa/router';

import type { ChaosConfig } from './config/loader';
import { resolveConfigMiddlewares } from './config/parser';

export function startServer(config: ChaosConfig, options?: { verbose?: boolean }) {
  const app = new Koa();
  const router = new Router();
  const httpAgent = new http.Agent({ keepAlive: true });
  const httpsAgent = new https.Agent({ keepAlive: true });

  // Resolve middlewares from config
  const { global, routes } = resolveConfigMiddlewares(config);

  // Mount global middlewares
  for (const mw of global) {
    app.use(mw);
  }

  // Mount route middlewares with method support
  for (const [routeKey, middlewares] of Object.entries(routes)) {
    const methodPathMatch = routeKey.match(/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+(.+)$/i);
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
      if (routeMethod) {
        routeMethod(path, ...middlewares);
      } else {
        throw new Error(`Unsupported HTTP method: ${method}`);
      }
    } else {
      // Mount for all HTTP methods if no method is specified
      const methods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];
      for (const method of methods) {
        (router[method as keyof typeof router] as (path: string, ...middleware: Array<Koa.Middleware>) => Router)(routeKey, ...middlewares);
      }
    }
  }
  app.use(router.routes());
  app.use(router.allowedMethods());

  // Hop-by-hop headers must not be forwarded
  const HOP_BY_HOP = new Set([
    'transfer-encoding', 'connection', 'keep-alive',
    'upgrade', 'proxy-connection', 'te', 'trailers',
  ]);

  // Proxy all requests to config.target
  app.use(async (ctx: Context) => {
    if (options?.verbose) {
      console.log(`[VERBOSE] ${ctx.method} ${ctx.url}`);
    }
    const targetUrl = new URL(config.target + ctx.url);
    const isHttps = targetUrl.protocol === 'https:';
    const proxyModule = isHttps ? https : http;

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
        // Buffer response body so downstream transforms (bodyTransform, headerTransform)
        // can intercept ctx.body before Koa sends the response.
        const chunks: Buffer[] = [];
        proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
        proxyRes.on('end', () => {
          const body = Buffer.concat(chunks);
          if (body.length > 0) {
            const contentType = String(proxyRes.headers['content-type'] || '');
            if (contentType.includes('application/json')) {
              try {
                ctx.body = JSON.parse(body.toString('utf8'));
              } catch {
                ctx.body = body;
              }
            } else {
              ctx.body = body;
            }
          }
          settle();
        });
        proxyRes.on('error', (err) => {
          if (options?.verbose) console.error('[Proxy] Response error:', err);
          ctx.status = 502;
          ctx.body = (err as Error).message;
          settle();
        });
      });

      proxyReq.on('error', (err) => {
        if (options?.verbose) {
          console.error('[Proxy] Error:', err);
        }
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
  });

  const server = app.listen(config.port ?? 5000, () => {
    console.log(`Chaos Proxy listening on port ${config.port ?? 5000} -> target ${config.target}`);
  });

  server.on('close', () => {
    httpAgent.destroy();
    httpsAgent.destroy();
  });

  return server;
}
