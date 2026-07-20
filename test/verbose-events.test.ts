import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Server } from 'http';
import http from 'http';
import { startServer } from '../src/server';

const TEST_PORT = 9001;
const TARGET = `http://localhost:${TEST_PORT}`;

let testServer: Server;
let proxyServer: Server;
let nextProxyPort = 9100;

describe('Verbose event logging', () => {
  beforeAll(() => {
    // Setup test upstream server
    testServer = http.createServer((req, res) => {
      if (req.url === '/ok') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } else if (req.url === '/error') {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'internal' }));
      } else if (req.url === '/slow') {
        setTimeout(() => {
          res.writeHead(200);
          res.end('delayed');
        }, 50);
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    testServer.listen(TEST_PORT);
  });

  afterAll(() => {
    testServer.close();
    if (proxyServer) proxyServer.close();
  });

  it('emits verbose.startup when server starts with verbose=true', async () => {
    const proxyPort = nextProxyPort++;
    const consoleSpy = vi.spyOn(console, 'log');

    proxyServer = startServer({ target: TARGET, port: proxyPort }, { verbose: true });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const startupLogs = consoleSpy.mock.calls.filter(
      (call) => call[0]?.includes?.('event=verbose.startup')
    );

    expect(startupLogs.length).toBeGreaterThan(0);
    expect(startupLogs[0][0]).toContain('target=' + TARGET);
    expect(startupLogs[0][0]).toContain('listen_port=' + proxyPort);

    consoleSpy.mockRestore();
    proxyServer.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it('emits verbose.request.begin and verbose.request.end for successful requests', async () => {
    const proxyPort = nextProxyPort++;
    const consoleSpy = vi.spyOn(console, 'log');

    proxyServer = startServer({ target: TARGET, port: proxyPort }, { verbose: true });

    await new Promise((resolve) => setTimeout(resolve, 100));
    consoleSpy.mockClear();

    const res = await fetch(`http://localhost:${proxyPort}/ok`);
    await res.json();

    await new Promise((resolve) => setTimeout(resolve, 50));

    const logs = consoleSpy.mock.calls.map((call) => call[0]);
    const beginLogs = logs.filter((log) => log?.includes?.('event=verbose.request.begin'));
    const endLogs = logs.filter((log) => log?.includes?.('event=verbose.request.end'));

    expect(beginLogs.length).toBeGreaterThan(0);
    expect(endLogs.length).toBeGreaterThan(0);
    expect(beginLogs[0]).toContain('method=GET');
    expect(beginLogs[0]).toContain('path=/ok');
    expect(endLogs[0]).toContain('status=200');
    expect(endLogs[0]).toContain('result=ok');

    consoleSpy.mockRestore();
    proxyServer.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it('emits verbose.request.end with error result for 5xx responses', async () => {
    const proxyPort = nextProxyPort++;
    const consoleSpy = vi.spyOn(console, 'log');
    const consoleErrorSpy = vi.spyOn(console, 'error');

    proxyServer = startServer({ target: TARGET, port: proxyPort }, { verbose: true });

    await new Promise((resolve) => setTimeout(resolve, 100));
    consoleSpy.mockClear();
    consoleErrorSpy.mockClear();

    const res = await fetch(`http://localhost:${proxyPort}/error`);
    expect(res.status).toBe(500);

    await new Promise((resolve) => setTimeout(resolve, 50));

    const allLogs = [...consoleSpy.mock.calls, ...consoleErrorSpy.mock.calls]
      .map((call) => call[0]);
    const endLogs = allLogs.filter((log) => log?.includes?.('event=verbose.request.end'));

    expect(endLogs.length).toBeGreaterThan(0);
    expect(endLogs[0]).toContain('status=500');
    expect(endLogs[0]).toContain('result=error');

    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    proxyServer.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it('emits verbose.shutdown on server close', async () => {
    const proxyPort = nextProxyPort++;
    const consoleSpy = vi.spyOn(console, 'log');

    proxyServer = startServer({ target: TARGET, port: proxyPort }, { verbose: true });

    await new Promise((resolve) => setTimeout(resolve, 100));
    consoleSpy.mockClear();

    proxyServer.close();

    await new Promise((resolve) => setTimeout(resolve, 100));

    const shutdownLogs = consoleSpy.mock.calls
      .map((call) => call[0])
      .filter((log) => log?.includes?.('event=verbose.shutdown'));

    expect(shutdownLogs.length).toBeGreaterThan(0);

    consoleSpy.mockRestore();
  });

  it('emits verbose.request.end with client_error result for 4xx responses', async () => {
    const proxyPort = nextProxyPort++;
    const consoleSpy = vi.spyOn(console, 'log');

    proxyServer = startServer({ target: TARGET, port: proxyPort }, { verbose: true });

    await new Promise((resolve) => setTimeout(resolve, 100));
    consoleSpy.mockClear();

    const res = await fetch(`http://localhost:${proxyPort}/notfound`);
    expect(res.status).toBe(404);

    await new Promise((resolve) => setTimeout(resolve, 50));

    const endLogs = consoleSpy.mock.calls
      .map((call) => call[0])
      .filter((log) => log?.includes?.('event=verbose.request.end'));

    expect(endLogs.length).toBeGreaterThan(0);
    expect(endLogs[0]).toContain('status=404');
    expect(endLogs[0]).toContain('result=client_error');

    consoleSpy.mockRestore();
    proxyServer.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it('includes req_id and duration_ms in verbose.request.end', async () => {
    const proxyPort = nextProxyPort++;
    const consoleSpy = vi.spyOn(console, 'log');

    proxyServer = startServer({ target: TARGET, port: proxyPort }, { verbose: true });

    await new Promise((resolve) => setTimeout(resolve, 100));
    consoleSpy.mockClear();

    const res = await fetch(`http://localhost:${proxyPort}/ok`);
    await res.json();

    await new Promise((resolve) => setTimeout(resolve, 50));

    const endLogs = consoleSpy.mock.calls
      .map((call) => call[0])
      .filter((log) => log?.includes?.('event=verbose.request.end'));

    expect(endLogs.length).toBeGreaterThan(0);
    expect(endLogs[0]).toMatch(/req_id=rq_[a-f0-9]+/);
    expect(endLogs[0]).toMatch(/duration_ms=\d+/);

    consoleSpy.mockRestore();
    proxyServer.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
});
