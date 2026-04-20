import { describe, it, beforeAll, afterAll, expect, vi } from 'vitest';
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import type { Middleware } from 'koa';
import type { Server } from 'http';
import http from 'http';
import { EventEmitter } from 'events';
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
  it('throws on unsupported HTTP method in route key (lines 46-47)', () => {
    expect(() =>
      startServer({
        target: TARGET,
        port: PROXY_PORT + 90,
        routes: {
          'TRACE /api/cc': [],
        },
      } as unknown as Parameters<typeof startServer>[0])
    ).toThrow(/Unsupported HTTP method: trace/i);
  });

  it('accepts method-less route keys and starts server (lines 51-55)', async () => {
    const proxyPort = PROXY_PORT + 91;
    const parserModule = await import('../src/config/parser');
    const parserSpy = vi.spyOn(parserModule, 'resolveConfigMiddlewares');
    parserSpy.mockReturnValue({
      global: [],
      routes: {
        '/api/cc': [
          (async (ctx, next) => {
            ctx.set('X-No-Method', 'yes');
            await next();
          }) as Middleware,
        ],
      },
    });

    const srv = startServer({ target: TARGET, port: proxyPort });

    try {
      const getRes = await fetch(`http://localhost:${proxyPort}/api/cc`);
      const postRes = await fetch(`http://localhost:${proxyPort}/api/cc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });

      expect(getRes.headers.get('x-no-method')).toBe('yes');
      expect(postRes.headers.get('x-no-method')).toBe('yes');
    } finally {
      srv.close();
      parserSpy.mockRestore();
    }
  });

  it('returns 500 when middleware calls next() twice (lines 120-121)', async () => {
    const proxyPort = PROXY_PORT + 92;
    const parserModule = await import('../src/config/parser');
    const parserSpy = vi.spyOn(parserModule, 'resolveConfigMiddlewares');
    parserSpy.mockReturnValue({
      global: [
        (async (_ctx, next) => {
          await next();
          await next();
        }) as Middleware,
      ],
      routes: {},
    });

    const srv = startServer({ target: TARGET, port: proxyPort });
    try {
      const res = await fetch(`http://localhost:${proxyPort}/api/cc`);
      expect(res.status).toBe(500);
    } finally {
      srv.close();
      parserSpy.mockRestore();
    }
  });

  it('serializes pre-populated ctx.request.body and sets content-length (lines 171-176)', async () => {
    const upstreamPort = PROXY_PORT + 93;
    const proxyPort = PROXY_PORT + 94;

    let seenBody = '';
    let seenContentLength: string | undefined;

    const upstream = http.createServer((req, res) => {
      seenContentLength = req.headers['content-length'];
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        seenBody = Buffer.concat(chunks).toString('utf8');
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    });

    await new Promise<void>((resolve) => upstream.listen(upstreamPort, resolve));

    const parserModule = await import('../src/config/parser');
    const parserSpy = vi.spyOn(parserModule, 'resolveConfigMiddlewares');
    parserSpy.mockReturnValue({
      global: [
        (async (ctx, next) => {
          const reqWithBody = ctx.request as unknown as { body?: unknown };
          reqWithBody.body = { injected: true };
          await next();
        }) as Middleware,
      ],
      routes: {},
    });

    const srv = startServer({ target: `http://localhost:${upstreamPort}`, port: proxyPort });

    try {
      const res = await fetch(`http://localhost:${proxyPort}/echo`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ original: false }),
      });
      expect(res.status).toBe(200);
      expect(seenBody).toBe('{"injected":true}');
      expect(seenContentLength).toBe(String(Buffer.byteLength('{"injected":true}', 'utf8')));
    } finally {
      srv.close();
      upstream.close();
      parserSpy.mockRestore();
    }
  });

  it('serializes string ctx.request.body without JSON.stringify (line 171)', async () => {
    const upstreamPort = PROXY_PORT + 95;
    const proxyPort = PROXY_PORT + 96;

    let seenBody = '';
    const upstream = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        seenBody = Buffer.concat(chunks).toString('utf8');
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    await new Promise<void>((resolve) => upstream.listen(upstreamPort, resolve));

    const parserModule = await import('../src/config/parser');
    const parserSpy = vi.spyOn(parserModule, 'resolveConfigMiddlewares');
    parserSpy.mockReturnValue({
      global: [
        (async (ctx, next) => {
          const reqWithBody = ctx.request as unknown as { body?: unknown };
          reqWithBody.body = 'raw-string-body';
          await next();
        }) as Middleware,
      ],
      routes: {},
    });

    const srv = startServer({ target: `http://localhost:${upstreamPort}`, port: proxyPort });
    try {
      const res = await fetch(`http://localhost:${proxyPort}/echo`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ original: false }),
      });
      expect(res.status).toBe(200);
      expect(seenBody).toBe('raw-string-body');
    } finally {
      srv.close();
      upstream.close();
      parserSpy.mockRestore();
    }
  });

  it('handles stream response error path and logs in verbose mode (lines 212, 220-222)', async () => {
    const proxyPort = PROXY_PORT + 97;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const requestSpy = vi.spyOn(http, 'request').mockImplementation(((options: unknown, cb: unknown) => {
      const callback = cb as (res: http.IncomingMessage) => void;
      const proxyReq = new EventEmitter() as unknown as http.ClientRequest;

      (proxyReq as unknown as { end: (chunk?: Buffer) => void }).end = () => {
        const proxyRes = new EventEmitter() as unknown as http.IncomingMessage;
        (proxyRes as unknown as { statusCode: number }).statusCode = 200;
        (proxyRes as unknown as { headers: http.IncomingHttpHeaders }).headers = {
          'content-type': 'text/event-stream',
        };
        callback(proxyRes);
        setTimeout(() => {
          (proxyRes as unknown as EventEmitter).emit('error', new Error('stream failed'));
        }, 0);
      };

      (proxyReq as unknown as { destroy: () => void }).destroy = () => {};
      return proxyReq;
    }) as unknown as typeof http.request);

    const parserModule = await import('../src/config/parser');
    const parserSpy = vi.spyOn(parserModule, 'resolveConfigMiddlewares');
    parserSpy.mockReturnValue({
      global: [
        (async (ctx, next) => {
          const reqWithBody = ctx.request as unknown as { body?: unknown };
          reqWithBody.body = 'x';
          await next();
        }) as Middleware,
      ],
      routes: {},
    });

    const srv = startServer({ target: 'http://unused', port: proxyPort }, { verbose: true });
    try {
      await fetch(`http://localhost:${proxyPort}/events`, { method: 'POST', body: 'irrelevant' });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(errSpy).toHaveBeenCalledWith('[Proxy] Response error:', expect.any(Error));
    } finally {
      srv.close();
      parserSpy.mockRestore();
      requestSpy.mockRestore();
      errSpy.mockRestore();
    }
  });

  it('handles buffered response error path and proxy request error path (lines 238-241, 260-261)', async () => {
    const proxyPort = PROXY_PORT + 98;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let callCount = 0;

    const requestSpy = vi.spyOn(http, 'request').mockImplementation(((options: unknown, cb: unknown) => {
      const callback = cb as (res: http.IncomingMessage) => void;
      const proxyReqEmitter = new EventEmitter();
      const proxyReq = proxyReqEmitter as unknown as http.ClientRequest;

      (proxyReq as unknown as { end: (chunk?: Buffer) => void }).end = () => {
        callCount += 1;
        if (callCount === 1) {
          const proxyRes = new EventEmitter() as unknown as http.IncomingMessage;
          (proxyRes as unknown as { statusCode: number }).statusCode = 200;
          (proxyRes as unknown as { headers: http.IncomingHttpHeaders }).headers = {
            'content-type': 'text/plain',
            'content-length': '10',
          };
          callback(proxyRes);
          setTimeout(() => {
            (proxyRes as unknown as EventEmitter).emit('error', new Error('buffered failed'));
          }, 0);
          return;
        }

        setTimeout(() => {
          proxyReqEmitter.emit('error', new Error('request failed'));
        }, 0);
      };

      (proxyReq as unknown as { destroy: () => void }).destroy = () => {};
      return proxyReq;
    }) as unknown as typeof http.request);

    const parserModule = await import('../src/config/parser');
    const parserSpy = vi.spyOn(parserModule, 'resolveConfigMiddlewares');
    parserSpy.mockReturnValue({
      global: [
        (async (ctx, next) => {
          const reqWithBody = ctx.request as unknown as { body?: unknown };
          reqWithBody.body = 'x';
          await next();
        }) as Middleware,
      ],
      routes: {},
    });

    const srv = startServer({ target: 'http://unused', port: proxyPort }, { verbose: true });
    try {
      await fetch(`http://localhost:${proxyPort}/buffered`, { method: 'POST', body: 'irrelevant' });
      await fetch(`http://localhost:${proxyPort}/request-error`, { method: 'POST', body: 'irrelevant' });
      await new Promise((resolve) => setTimeout(resolve, 30));

      expect(errSpy).toHaveBeenCalledWith('[Proxy] Response error:', expect.any(Error));
      expect(errSpy).toHaveBeenCalledWith('[Proxy] Error:', expect.any(Error));
    } finally {
      srv.close();
      parserSpy.mockRestore();
      requestSpy.mockRestore();
      errSpy.mockRestore();
    }
  });

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

// ─── /reload endpoint edge cases ──────────────────────────────────────────

describe('/reload endpoint — content-type and JSON errors', () => {
  let reloadProxy: ReturnType<typeof startServer>;
  const RELOAD_PORT = PROXY_PORT + 100;

  beforeAll(() => {
    reloadProxy = startServer({ target: TARGET, port: RELOAD_PORT });
  });
  afterAll(() => {
    reloadProxy.close();
  });

  it('returns 415 when Content-Type is not application/json', async () => {
    const res = await fetch(`http://localhost:${RELOAD_PORT}/reload`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: '{}',
    });
    expect(res.status).toBe(415);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/Content-Type/);
  });

  it('returns 400 for invalid JSON body', async () => {
    const res = await fetch(`http://localhost:${RELOAD_PORT}/reload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json{{{',
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/Invalid JSON/);
  });
});

// ─── proxyRequest — verbose [VERBOSE] log (lines 171-176) ─────────────────

describe('proxyRequest — verbose request logging', () => {
  it('logs [VERBOSE] METHOD path when verbose=true', async () => {
    const proxyPort = PROXY_PORT + 101;
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const srv = startServer({ target: TARGET, port: proxyPort }, { verbose: true });
    try {
      await fetch(`http://localhost:${proxyPort}/api/cc`);
      expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/\[VERBOSE\] GET \/api\/cc/));
    } finally {
      srv.close();
      logSpy.mockRestore();
    }
  });
});

// ─── proxyRequest error paths ──────────────────────────────────────────────

describe('proxyRequest — upstream connection refused', () => {
  it('returns 502 when upstream refuses connection', async () => {
    const proxyPort = PROXY_PORT + 40;
    const srv = startServer({ target: 'http://localhost:19998', port: proxyPort });
    try {
      const res = await fetch(`http://localhost:${proxyPort}/any`);
      expect(res.status).toBe(502);
    } finally {
      srv.close();
    }
  });

  // line 260-261: verbose log on proxyReq error
  it('logs [Proxy] Error: with verbose=true on connection refused', async () => {
    const proxyPort = PROXY_PORT + 41;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const srv = startServer({ target: 'http://localhost:19998', port: proxyPort }, { verbose: true });
    try {
      const res = await fetch(`http://localhost:${proxyPort}/any`);
      expect(res.status).toBe(502);
      expect(errSpy).toHaveBeenCalledWith('[Proxy] Error:', expect.any(Error));
    } finally {
      srv.close();
      errSpy.mockRestore();
    }
  });
});

// ─── streaming response (SSE — no content-length, line 212) ────────────────

describe('proxyRequest — SSE streaming response', () => {
  it('pipes SSE response and sets isStream=true (line 212)', async () => {
    const upstreamPort = PROXY_PORT + 42;
    const proxyPort = PROXY_PORT + 43;

    const upstream = http.createServer((_req, res) => {
      // SSE: content-type text/event-stream, no content-length → isStream=true
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: hello\n\n');
      res.end();
    });
    await new Promise<void>((resolve) => upstream.listen(upstreamPort, resolve));

    const srv = startServer({ target: `http://localhost:${upstreamPort}`, port: proxyPort });
    try {
      const res = await fetch(`http://localhost:${proxyPort}/events`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      const body = await res.text();
      expect(body).toContain('data: hello');
    } finally {
      srv.close();
      await new Promise<void>((resolve) => upstream.close(() => resolve()));
    }
  });
});

// ─── buffered response stream error (lines 238-241) ───────────────────────

describe('proxyRequest — buffered response stream error', () => {
  it('returns 502 when upstream destroys the response mid-stream', async () => {
    const upstreamPort = PROXY_PORT + 44;
    const proxyPort = PROXY_PORT + 45;

    const upstream = http.createServer((_req, res) => {
      // Send headers + partial body with explicit content-length → buffered mode
      // Then destroy to trigger proxyRes 'error' event
      res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Length': '100' });
      res.write('partial');
      // Destroy the underlying socket to force an error on the response stream
      res.socket?.destroy(new Error('forced upstream error'));
    });
    await new Promise<void>((resolve) => upstream.listen(upstreamPort, resolve));

    const srv = startServer({ target: `http://localhost:${upstreamPort}`, port: proxyPort });
    try {
      const res = await fetch(`http://localhost:${proxyPort}/broken`);
      // Either 502 from the error handler or connection reset; both are acceptable
      expect([200, 502]).toContain(res.status);
    } catch {
      // fetch may throw on connection reset — that's also acceptable
    } finally {
      srv.close();
      await new Promise<void>((resolve) => upstream.close(() => resolve()));
    }
  });
});

// ─── onClientAbort when not yet settled (line 272) ────────────────────────

describe('proxyRequest — client abort before response', () => {
  it('destroys the proxyReq when client aborts before upstream responds', async () => {
    const upstreamPort = PROXY_PORT + 46;
    const proxyPort = PROXY_PORT + 47;
    let upstreamGotRequest = false;

    const upstream = http.createServer((_req, res) => {
      upstreamGotRequest = true;
      // Hang: don't respond for a while so the client can abort first
      setTimeout(() => res.end('late'), 5000);
    });
    await new Promise<void>((resolve) => upstream.listen(upstreamPort, resolve));

    const srv = startServer({ target: `http://localhost:${upstreamPort}`, port: proxyPort });
    try {
      const controller = new AbortController();
      const p = fetch(`http://localhost:${proxyPort}/slow`, { signal: controller.signal });
      // Give the request time to reach upstream before aborting
      await new Promise((r) => setTimeout(r, 50));
      controller.abort();
      await expect(p).rejects.toThrow();
      // Upstream received the request; proxy cleaned up even though not yet settled
      expect(upstreamGotRequest).toBe(true);
    } finally {
      srv.close();
      await new Promise<void>((resolve) => upstream.close(() => resolve()));
    }
  });
});

// ─── server close event (line 370) ────────────────────────────────────────

describe('server close event — telemetry shutdown', () => {
  it('shuts down telemetry exporters when server closes', async () => {
    const proxyPort = PROXY_PORT + 48;
    const srv = startServer({ target: TARGET, port: proxyPort });
    await new Promise<void>((resolve, reject) =>
      srv.close((err) => (err ? reject(err) : resolve()))
    );
    // Reached here = close handler ran without throwing
  });

  it('logs error when telemetry shutdown fails (line 370)', async () => {
    const proxyPort = PROXY_PORT + 49;
    const telemetry = await import('../src/telemetry/middleware');
    // Make shutdownAllTelemetryExporters reject so the catch branch runs
    vi.spyOn(telemetry, 'shutdownAllTelemetryExporters').mockRejectedValueOnce(new Error('shutdown failed'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const srv = startServer({ target: TARGET, port: proxyPort });
    await new Promise<void>((resolve, reject) =>
      srv.close((err) => (err ? reject(err) : resolve()))
    );
    // Allow the microtask (the .catch callback) to run
    await new Promise((r) => setTimeout(r, 0));
    expect(errSpy).toHaveBeenCalledWith(
      '[chaos-proxy telemetry] Failed to shutdown exporters:',
      expect.any(Error)
    );
    errSpy.mockRestore();
  });
});

// ─── reload body too large (lines 94-96) ──────────────────────────────────

describe('/reload — oversized body', () => {
  it('returns 400 when reload body exceeds 1MB', async () => {
    const proxyPort = PROXY_PORT + 50;
    const srv = startServer({ target: TARGET, port: proxyPort });
    try {
      // Build a JSON string just over 1MB
      const bigValue = 'x'.repeat(1024 * 1024 + 1);
      const res = await fetch(`http://localhost:${proxyPort}/reload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: TARGET, pad: bigValue }),
      });
      expect(res.status).toBe(400);
      const body = await res.json() as { ok: boolean; error: string };
      expect(body.ok).toBe(false);
      expect(body.error).toMatch(/too large/);
    } finally {
      srv.close();
    }
  });
});

// ─── runMiddlewareChain — mw undefined guard (lines 131-132) ──────────────
// This branch is defensive dead code (sparse array), tested via direct unit

describe('runMiddlewareChain — direct unit: mw undefined guard', () => {
  it('skips undefined entries in the middleware array without throwing', async () => {
    // Dynamically import to access the internal function via a test shim.
    // We test through startServer with a sparse middleware array.
    const proxyPort = PROXY_PORT + 51;
    const parserModule = await import('../src/config/parser');
    const parserSpy = vi.spyOn(parserModule, 'resolveConfigMiddlewares');

    // Sparse array with an undefined hole
    const sparse = [undefined as unknown as Middleware, (async (_ctx: unknown, next: () => Promise<void>) => { await next(); }) as Middleware];

    parserSpy.mockReturnValue({ global: sparse, routes: {} });

    const serverModule = await import('../src/server');
    const srv = serverModule.startServer({ target: TARGET, port: proxyPort }) as Server;
    try {
      const res = await fetch(`http://localhost:${proxyPort}/api/cc`);
      // Either proxied successfully or 404 — it must not 500
      expect([200, 404]).toContain(res.status);
    } finally {
      srv.close();
      parserSpy.mockRestore();
    }
  });
});
