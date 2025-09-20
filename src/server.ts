import express from 'express';
import type { Request, Response } from 'express';

import type { ChaosConfig } from './config/loader';
import { resolveConfigMiddlewares } from './config/parser.ts';

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
  app.use(async (req: Request, res: Response) => {
    const url = config.target + req.originalUrl;
    const method = req.method;

    // Convert Express headers to string-to-string map for fetch
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers[key] = value;
    }
    // Remove host header to avoid conflicts
    delete headers.host;

    let body: unknown = undefined;
    const fetchOptions: Record<string, unknown> = {
      method,
      headers,
      redirect: 'manual',
    };
    if (method !== 'GET' && method !== 'HEAD') {
      body = req;
      fetchOptions.body = body;
      fetchOptions.duplex = 'half';
    }

    if (options?.verbose) {
      console.log(`[VERBOSE] ${method} ${req.originalUrl}`);
    }

    try {
      const proxyRes = await fetch(url, fetchOptions);
      res.status(proxyRes.status);
      proxyRes.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });
      const data = await proxyRes.arrayBuffer();
      res.send(Buffer.from(data));
    } catch (err) {
      res.status(502).send((err as Error).message);
    }
  });

  return app.listen(config.port ?? 5000, () => {
    console.log(`Chaos Proxy listening on port ${config.port ?? 5000} -> target ${config.target}`);
  });
}
