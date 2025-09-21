import http from 'http';
import https from 'https';
import express from 'express';
import type { Request, Response } from 'express';

import type { ChaosConfig } from './config/loader';
import { resolveConfigMiddlewares } from './config/parser';

export function startServer(config: ChaosConfig, options?: { verbose?: boolean }) {
  const app = express();

  // Resolve middlewares from config
  const { global, routes } = resolveConfigMiddlewares(config);

  // Mount global middlewares
  if (global.length) {
    app.use(...global);
  }

  // Mount route middlewares with method support
  for (const [routeKey, middlewares] of Object.entries(routes)) {
    // Check for method+path format
    const methodPathMatch = routeKey.match(/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+(.+)$/i);
    if (methodPathMatch && methodPathMatch[1] && methodPathMatch[2]) {
      const method = methodPathMatch[1].toLowerCase();
      const path = methodPathMatch[2];
      const expressApp = app as unknown as Record<string, (...args: unknown[]) => void>;
      if (typeof expressApp[method] === 'function') {
        expressApp[method](path, ...middlewares);
      } else {
        throw new Error(`Unsupported HTTP method: ${method}`);
      }
    } else {
      // Fallback: mount as path-only
      app.use(routeKey, ...middlewares);
    }
  }

  // Proxy all requests to config.target
  app.use((req: Request, res: Response) => {
    if (options?.verbose) {
      console.log(`[VERBOSE] ${req.method} ${req.originalUrl}`);
    }
    const targetUrl = new URL(config.target + req.originalUrl);
    const isHttps = targetUrl.protocol === 'https:';
    const proxyModule = isHttps ? https : http;

    // Prepare headers
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers[key] = value;
    }
    // Remove host header to avoid conflicts
    delete headers.host;
    headers.host = targetUrl.host;

    const proxyReq = proxyModule.request({
      protocol: targetUrl.protocol,
      hostname: targetUrl.hostname,
      port: targetUrl.port || (isHttps ? 443 : 80),
      path: targetUrl.pathname + targetUrl.search,
      method: req.method,
      headers,
    }, (proxyRes) => {
      Object.entries(proxyRes.headers).forEach(([key, value]) => {
        if (value !== undefined) res.setHeader(key, value);
      });
      res.status(proxyRes.statusCode || 500);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      if (options?.verbose) {
        console.error('[Proxy] Error:', err);
      }
      res.status(502).send((err as Error).message);
    });

    // Pipe request body
    req.pipe(proxyReq);
  });
  return app.listen(config.port ?? 5000, () => {
    console.log(`Chaos Proxy listening on port ${config.port ?? 5000} -> target ${config.target}`);
  });
}
