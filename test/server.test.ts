import { describe, it, beforeAll, afterAll, expect, vi } from 'vitest';
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import type { Middleware } from 'koa';
import type { Server } from 'http';
import http from 'http';
import { startServer } from '../src/server';

let testServer: Server;
let proxyServer: Server;
const TEST_PORT = 8001;
const PROXY_PORT = 8002;
const TARGET = `http://localhost:${TEST_PORT}`;

interface BodyParsedRequest extends Koa.Request {
  body?: unknown;
}

function startTestServer() {
  const app = new Koa();
  app.use(bodyParser());
  app.use(async (ctx, next) => {
    const req = ctx.request as BodyParsedRequest;
    if (ctx.method === 'GET' && ctx.path === '/api/cc') {
      ctx.status = 200;
      ctx.body = { message: 'GET success', query: ctx.query };
    } else if (ctx.method === 'POST' && ctx.path === '/api/cc') {
      ctx.status = 201;
      ctx.body = { message: 'POST success', body: req.body };
    } else if (ctx.method === 'GET' && ctx.path === '/api/error') {
      ctx.status = 500;
      ctx.body = { error: 'Internal error' };
    } else if (ctx.method === 'GET' && ctx.path === '/api/headers') {
      ctx.status = 200;
      ctx.body = { headers: ctx.headers };
    } else if (ctx.method === 'POST' && ctx.path === '/api/echo') {
      ctx.status = 200;
      ctx.body = { headers: ctx.headers, body: req.body };
    } else {
      await next();
    }
  });
  return app.listen(TEST_PORT);
}

function startProxyServer() {
  return startServer({ target: TARGET, port: PROXY_PORT });
}

async function compareResponses(direct: globalThis.Response, proxied: globalThis.Response) {
  expect(proxied.status).toBe(direct.status);
  expect(proxied.headers.get('content-type')).toBe(direct.headers.get('content-type'));
  const directBody = await direct.text();
  const proxiedBody = await proxied.text();
  expect(proxiedBody).toBe(directBody);
}

async function compareJsonResponses(direct: globalThis.Response, proxied: globalThis.Response) {
  expect(proxied.status).toBe(direct.status);
  expect(proxied.headers.get('content-type')).toBe(direct.headers.get('content-type'));
  const directJson = await direct.json();
  const proxiedJson = await proxied.json();
  expect(proxiedJson).toEqual(directJson);
}

describe('Proxy server', () => {
  beforeAll(() => {
    testServer = startTestServer();
    proxyServer = startProxyServer();
  });
  afterAll(() => {
    testServer.close();
    proxyServer.close();
  });

  it('GET /api/cc returns same as direct', async () => {
    const direct = await fetch(`${TARGET}/api/cc?foo=bar`);
    const proxied = await fetch(`http://localhost:${PROXY_PORT}/api/cc?foo=bar`);
    await compareJsonResponses(direct, proxied);
  });

  it('POST /api/cc returns same as direct', async () => {
    const body = { test: 'data' };
    const direct = await fetch(`${TARGET}/api/cc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const proxied = await fetch(`http://localhost:${PROXY_PORT}/api/cc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    await compareJsonResponses(direct, proxied);
  });

  it('GET /api/headers returns same headers as direct', async () => {
    const direct = await fetch(`${TARGET}/api/headers`, {
      headers: { 'X-Test': 'foo' },
    });
    const proxied = await fetch(`http://localhost:${PROXY_PORT}/api/headers`, {
      headers: { 'X-Test': 'foo' },
    });
    await compareJsonResponses(direct, proxied);
  });

  it('POST /api/echo returns same headers and body as direct', async () => {
    const body = { echo: 'bar' };
    const direct = await fetch(`${TARGET}/api/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Test': 'foo' },
      body: JSON.stringify(body),
    });
    const proxied = await fetch(`http://localhost:${PROXY_PORT}/api/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Test': 'foo' },
      body: JSON.stringify(body),
    });
    await compareJsonResponses(direct, proxied);
  });

  it('GET /api/error returns same error as direct', async () => {
    const direct = await fetch(`${TARGET}/api/error`);
    const proxied = await fetch(`http://localhost:${PROXY_PORT}/api/error`);
    await compareResponses(direct, proxied);
  });

  it('GET /api/missing returns same error as direct', async () => {
    const direct = await fetch(`${TARGET}/api/missing`);
    const proxied = await fetch(`http://localhost:${PROXY_PORT}/api/missing`);
    await compareResponses(direct, proxied);
  });
});

describe('startServer edge cases', () => {
  it('mounts global middlewares', async () => {
    const globalMiddleware: Middleware = async (ctx, next) => {
      ctx.set('X-Global', 'yes');
      await next();
    };
    const config = {
      target: TARGET,
      port: PROXY_PORT + 1,
      global: [globalMiddleware],
      routes: {},
    };
    // Patch resolveConfigMiddlewares to return our config
    const serverModule = await import('../src/server');
    vi.spyOn(await import('../src/config/parser'), 'resolveConfigMiddlewares').mockReturnValue(config);
    const app = serverModule.startServer({ target: TARGET, port: PROXY_PORT + 1 }, {}) as Server;
    const res = await fetch(`http://localhost:${PROXY_PORT + 1}/api/cc`);
    expect(res.headers.get('x-global')).toBe('yes');
    app.close();
  });

  it('mounts route middlewares with method support', async () => {
    const mw: Middleware = async (ctx, next) => {
      ctx.set('X-Route', 'yes');
      await next();
    };
    const config = {
      target: TARGET,
      port: PROXY_PORT + 2,
      global: [],
      routes: { 'GET /api/cc': [mw] },
    };
    vi.spyOn(await import('../src/config/parser'), 'resolveConfigMiddlewares').mockReturnValue(config);
    const serverModule = await import('../src/server');
    const app = serverModule.startServer({ target: TARGET, port: PROXY_PORT + 2 }, {}) as Server;
    const res = await fetch(`http://localhost:${PROXY_PORT + 2}/api/cc`);
    expect(res.headers.get('x-route')).toBe('yes');
    app.close();
  });

  it('logs verbose output', async () => {
    const config = {
      target: TARGET,
      port: PROXY_PORT + 4,
      global: [],
      routes: {},
    };
    vi.spyOn(await import('../src/config/parser'), 'resolveConfigMiddlewares').mockReturnValue(config);
    const serverModule = await import('../src/server');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const app = serverModule.startServer(
      { target: TARGET, port: PROXY_PORT + 4 },
      { verbose: true }
    ) as Server;
    await fetch(`http://localhost:${PROXY_PORT + 4}/api/cc`);
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/\[VERBOSE\] GET \/api\/cc/));
    app.close();
    logSpy.mockRestore();
  });

  it('logs server start message', async () => {
    const config = {
      target: TARGET,
      port: PROXY_PORT + 5,
      global: [],
      routes: {},
    };
    vi.spyOn(await import('../src/config/parser'), 'resolveConfigMiddlewares').mockReturnValue(config);
    const serverModule = await import('../src/server');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    let app: Server | undefined = undefined;
    await new Promise((resolve) => {
      app = serverModule.startServer({ target: TARGET, port: PROXY_PORT + 5 }, {});
      setTimeout(resolve, 100); // Wait for listen callback
    });
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/Chaos Proxy listening on port/));
    if (app) (app as Server).close();
    logSpy.mockRestore();
  });
});

describe('proxy transport behavior', () => {
  it('reuses upstream sockets via keep-alive agent', async () => {
    const upstreamPort = PROXY_PORT + 20;
    const proxyPort = PROXY_PORT + 21;
    const sockets = new Set<string>();

    const upstream = http.createServer((req, res) => {
      const socket = req.socket;
      sockets.add(`${socket.remoteAddress}:${socket.remotePort}`);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });

    await new Promise<void>((resolve) => upstream.listen(upstreamPort, resolve));
    const proxy = startServer({ target: `http://localhost:${upstreamPort}`, port: proxyPort });

    try {
      const a = await fetch(`http://localhost:${proxyPort}/x`);
      expect(a.status).toBe(200);
      await a.text();

      const b = await fetch(`http://localhost:${proxyPort}/y`);
      expect(b.status).toBe(200);
      await b.text();

      // With keep-alive agent, repeated requests should reuse the same upstream socket.
      expect(sockets.size).toBe(1);
    } finally {
      proxy.close();
      upstream.close();
    }
  });

  it('propagates client abort to upstream response stream', async () => {
    const upstreamPort = PROXY_PORT + 22;
    const proxyPort = PROXY_PORT + 23;
    let upstreamClosed = false;

    const upstream = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      // Keep response open; proxy should close it when downstream aborts.
      const timer = setTimeout(() => {
        res.end('too late');
      }, 5000);
      res.on('close', () => {
        clearTimeout(timer);
        upstreamClosed = true;
      });
    });

    await new Promise<void>((resolve) => upstream.listen(upstreamPort, resolve));
    const proxy = startServer({ target: `http://localhost:${upstreamPort}`, port: proxyPort });

    try {
      const controller = new AbortController();
      const requestPromise = fetch(`http://localhost:${proxyPort}/slow`, {
        signal: controller.signal,
      });

      setTimeout(() => controller.abort(), 50);

      await expect(requestPromise).rejects.toThrow();

      // Give cancellation/cleanup time to propagate to upstream.
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(upstreamClosed).toBe(true);
    } finally {
      proxy.close();
      upstream.close();
    }
  });
});

describe('runtime config reload', () => {
  it('reloads config and applies new middleware chain for new requests', async () => {
    const proxyPort = PROXY_PORT + 30;
    const parserModule = await import('../src/config/parser');
    const parserSpy = vi.spyOn(parserModule, 'resolveConfigMiddlewares');
    parserSpy.mockImplementation((cfg) => {
      const withHeader = (cfg as Record<string, unknown>).mode === 'on';
      return {
        global: withHeader
          ? [
              (async (ctx, next) => {
                ctx.set('X-Reloaded', 'yes');
                await next();
              }) as Middleware,
            ]
          : [],
        routes: {},
      };
    });

    const proxy = startServer({ target: TARGET, port: proxyPort } as unknown as Parameters<typeof startServer>[0]);

    try {
      const before = await fetch(`http://localhost:${proxyPort}/api/cc`);
      expect(before.headers.get('x-reloaded')).toBeNull();

      const reloadRes = await fetch(`http://localhost:${proxyPort}/reload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: TARGET, port: proxyPort, mode: 'on' }),
      });
      expect(reloadRes.status).toBe(200);
      const reloadBody = await reloadRes.json() as { ok: boolean; version: number; reloadMs: number };
      expect(reloadBody.ok).toBe(true);
      expect(reloadBody.version).toBeGreaterThan(1);

      const after = await fetch(`http://localhost:${proxyPort}/api/cc`);
      expect(after.headers.get('x-reloaded')).toBe('yes');
    } finally {
      proxy.close();
      parserSpy.mockRestore();
    }
  });

  it('rejects invalid reload and keeps previous runtime state', async () => {
    const proxyPort = PROXY_PORT + 31;
    const parserModule = await import('../src/config/parser');
    const parserSpy = vi.spyOn(parserModule, 'resolveConfigMiddlewares');
    parserSpy.mockReturnValue({
      global: [
        (async (ctx, next) => {
          ctx.set('X-Stable', 'old');
          await next();
        }) as Middleware,
      ],
      routes: {},
    });

    const proxy = startServer({ target: TARGET, port: proxyPort });

    try {
      const before = await fetch(`http://localhost:${proxyPort}/api/cc`);
      expect(before.headers.get('x-stable')).toBe('old');

      const reloadRes = await fetch(`http://localhost:${proxyPort}/reload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port: proxyPort }),
      });
      expect(reloadRes.status).toBe(400);
      const body = await reloadRes.json() as { ok: boolean; error: string };
      expect(body.ok).toBe(false);
      expect(body.error).toContain('target');

      const after = await fetch(`http://localhost:${proxyPort}/api/cc`);
      expect(after.headers.get('x-stable')).toBe('old');
    } finally {
      proxy.close();
      parserSpy.mockRestore();
    }
  });

  it('keeps in-flight requests on old snapshot while new requests use new snapshot', async () => {
    const proxyPort = PROXY_PORT + 32;
    const parserModule = await import('../src/config/parser');
    const parserSpy = vi.spyOn(parserModule, 'resolveConfigMiddlewares');
    parserSpy.mockImplementation((cfg) => {
      const mode = (cfg as Record<string, unknown>).mode;
      if (mode === 'fast') {
        return {
          global: [
            (async (ctx, next) => {
              ctx.set('X-Snapshot', 'new');
              await next();
            }) as Middleware,
          ],
          routes: {},
        };
      }
      return {
        global: [
          (async (ctx, next) => {
            await new Promise((resolve) => setTimeout(resolve, 120));
            ctx.set('X-Snapshot', 'old');
            await next();
          }) as Middleware,
        ],
        routes: {},
      };
    });

    const proxy = startServer({ target: TARGET, port: proxyPort, mode: 'slow' } as unknown as Parameters<typeof startServer>[0]);

    try {
      const inFlightPromise = fetch(`http://localhost:${proxyPort}/api/cc`);
      await new Promise((resolve) => setTimeout(resolve, 20));

      const reloadRes = await fetch(`http://localhost:${proxyPort}/reload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: TARGET, port: proxyPort, mode: 'fast' }),
      });
      expect(reloadRes.status).toBe(200);

      const inFlightResponse = await inFlightPromise;
      expect(inFlightResponse.headers.get('x-snapshot')).toBe('old');

      const postReloadResponse = await fetch(`http://localhost:${proxyPort}/api/cc`);
      expect(postReloadResponse.headers.get('x-snapshot')).toBe('new');
    } finally {
      proxy.close();
      parserSpy.mockRestore();
    }
  });

  it('rejects overlapping reload requests with 409', async () => {
    const proxyPort = PROXY_PORT + 33;
    const parserModule = await import('../src/config/parser');
    const parserSpy = vi.spyOn(parserModule, 'resolveConfigMiddlewares');
    parserSpy.mockReturnValue({ global: [], routes: {} });

    const proxy = startServer({ target: TARGET, port: proxyPort });

    try {
      const first = proxy.reloadConfig({ target: TARGET, port: proxyPort, mode: 'a' });
      const second = proxy.reloadConfig({ target: TARGET, port: proxyPort, mode: 'b' });

      const [firstResult, secondResult] = await Promise.all([first, second]);
      expect([firstResult.ok, secondResult.ok].sort()).toEqual([false, true]);
      const failed = firstResult.ok ? secondResult : firstResult;
      if (failed.ok) {
        throw new Error('Expected one reload call to fail with overlap');
      }
      expect(failed.statusCode).toBe(409);
    } finally {
      proxy.close();
      parserSpy.mockRestore();
    }
  });
});
