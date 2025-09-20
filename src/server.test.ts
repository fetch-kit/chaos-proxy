import { describe, it, beforeAll, afterAll, expect, vi } from 'vitest';
import express from 'express';
import { startServer } from './server';

let testServer: any;
let proxyServer: any;
const TEST_PORT = 8001;
const PROXY_PORT = 8002;
const TARGET = `http://localhost:${TEST_PORT}`;

function startTestServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/cc', (req, res) => {
    res.status(200).json({ message: 'GET success', query: req.query });
  });

  app.post('/api/cc', (req, res) => {
    res.status(201).json({ message: 'POST success', body: req.body });
  });

  app.get('/api/error', (req, res) => {
    res.status(500).json({ error: 'Internal error' });
  });

  app.get('/api/headers', (req, res) => {
    res.status(200).json({ headers: req.headers });
  });

  app.post('/api/echo', (req, res) => {
    res.status(200).json({ headers: req.headers, body: req.body });
  });

  return app.listen(TEST_PORT);
}

function startProxyServer() {
  return startServer({ target: TARGET, port: PROXY_PORT });
}

async function compareResponses(direct: Response, proxied: Response) {
  expect(proxied.status).toBe(direct.status);
  expect(proxied.headers.get('content-type')).toBe(direct.headers.get('content-type'));
  const directBody = await direct.text();
  const proxiedBody = await proxied.text();
  expect(proxiedBody).toBe(directBody);
}

async function compareJsonResponses(direct: Response, proxied: Response) {
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
    const globalMiddleware = (req: any, res: any, next: any) => {
      res.set('X-Global', 'yes');
      next();
    };
    const config = {
      target: TARGET,
      port: PROXY_PORT + 1,
      // Simulate config.parser output
      global: [globalMiddleware],
      routes: {},
    };
    // Patch resolveConfigMiddlewares to return our config
    const serverModule = await import('./server');
    vi.spyOn(await import('./config/parser.ts'), 'resolveConfigMiddlewares').mockReturnValue(config);
    const app = serverModule.startServer({ target: TARGET, port: PROXY_PORT + 1 }, {});
    const res = await fetch(`http://localhost:${PROXY_PORT + 1}/api/cc`);
    expect(res.headers.get('x-global')).toBe('yes');
    if (app) { app.close(); }
  });

  it('mounts route middlewares with method support', async () => {
    const mw = (req: any, res: any, next: any) => {
      res.set('X-Route', 'yes');
      next();
    };
    const config = {
      target: TARGET,
      port: PROXY_PORT + 2,
      global: [],
      routes: { 'GET /api/cc': [mw] },
    };
    vi.spyOn(await import('./config/parser.ts'), 'resolveConfigMiddlewares').mockReturnValue(config);
    const serverModule = await import('./server');
    const app = serverModule.startServer({ target: TARGET, port: PROXY_PORT + 2 }, {});
    const res = await fetch(`http://localhost:${PROXY_PORT + 2}/api/cc`);
    expect(res.headers.get('x-route')).toBe('yes');
    if (app) { app.close(); }
  });

  it('logs verbose output', async () => {
    const config = {
      target: TARGET,
      port: PROXY_PORT + 4,
      global: [],
      routes: {},
    };
    vi.spyOn(await import('./config/parser.ts'), 'resolveConfigMiddlewares').mockReturnValue(config);
    const serverModule = await import('./server');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const app = serverModule.startServer({ target: TARGET, port: PROXY_PORT + 4 }, { verbose: true });
    await fetch(`http://localhost:${PROXY_PORT + 4}/api/cc`);
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/\[VERBOSE\] GET \/api\/cc/));
    if (app) { app.close(); }
    logSpy.mockRestore();
  });

  it('logs server start message', async () => {
    const config = {
      target: TARGET,
      port: PROXY_PORT + 5,
      global: [],
      routes: {},
    };
    vi.spyOn(await import('./config/parser.ts'), 'resolveConfigMiddlewares').mockReturnValue(config);
    const serverModule = await import('./server');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    let app: any;
    await new Promise((resolve) => {
      app = serverModule.startServer({ target: TARGET, port: PROXY_PORT + 5 }, {});
      setTimeout(resolve, 100); // Wait for listen callback
    });
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(/Chaos Proxy listening on port/));
    if (app) { app.close(); }
    logSpy.mockRestore();
  });
});
