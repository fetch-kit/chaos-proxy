import { describe, it, beforeAll, afterAll, expect, vi } from 'vitest';
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import type { Middleware } from 'koa';
import type { Server } from 'http';
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
