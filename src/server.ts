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
      router.use(routeKey, ...middlewares);
    }
  }
  app.use(router.routes());
  app.use(router.allowedMethods());

  // Proxy all requests to config.target
  app.use(async (ctx: Context) => {
  if (options?.verbose) {
    console.log(`[VERBOSE] ${ctx.method} ${ctx.url}`);
  }
  const targetUrl = new URL(config.target + ctx.url);
  const isHttps = targetUrl.protocol === 'https:';
  const proxyModule = isHttps ? https : http;

  // Prepare headers
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(ctx.request.headers)) {
    if (typeof value === 'string') headers[key] = value;
  }
  delete headers.host;
  headers.host = targetUrl.host;

  ctx.respond = false; // Let Node handle the response
  await new Promise<void>((resolve, reject) => {
    const proxyReq = proxyModule.request({
      protocol: targetUrl.protocol,
      hostname: targetUrl.hostname,
      port: targetUrl.port || (isHttps ? 443 : 80),
      path: targetUrl.pathname + targetUrl.search,
      method: ctx.method,
      headers,
    }, (proxyRes) => {
      ctx.res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
      proxyRes.pipe(ctx.res);
      proxyRes.on('end', resolve);
      proxyRes.on('error', reject);
    });
    proxyReq.on('error', (err) => {
      if (options?.verbose) {
        console.error('[Proxy] Error:', err);
      }
      ctx.res.writeHead(502);
      ctx.res.end((err as Error).message);
      reject(err);
    });
    ctx.req.pipe(proxyReq);
  });
});

  return app.listen(config.port ?? 5000, () => {
    console.log(`Chaos Proxy listening on port ${config.port ?? 5000} -> target ${config.target}`);
  });
}