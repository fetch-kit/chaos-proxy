import fc from 'fast-check';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Context } from 'koa';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { registerMiddleware } from '../../src/registry/middleware';
import { startServer, type ChaosProxyServer } from '../../src/server';

let upstream: http.Server;
let proxy: ChaosProxyServer;
let upstreamOrigin: string;
let proxyOrigin: string;
let upstreamCalls = 0;
let consoleLog: ReturnType<typeof vi.spyOn>;

const close = (server: http.Server) =>
  new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

beforeAll(async () => {
  registerMiddleware('fuzzMark', (options) => {
    const label = String(options.label);
    return async (ctx: Context, next: () => Promise<void>) => {
      const previous = String(ctx.response.get('X-Fuzz-Order') || '');
      ctx.set('X-Fuzz-Order', previous ? `${previous},${label}` : label);
      await next();
    };
  });
  registerMiddleware('fuzzShort', (options) => {
    return async (ctx: Context) => {
      ctx.status = Number(options.status);
      ctx.body = String(options.body);
    };
  });
  registerMiddleware('fuzzOnion', (options) => {
    const label = String(options.label);
    return async (ctx: Context, next: () => Promise<void>) => {
      const order = (ctx.state.fuzzOrder ??= []) as string[];
      order.push(`enter-${label}`);
      await next();
      order.push(`exit-${label}`);
      ctx.set('X-Fuzz-Onion', order.join(','));
    };
  });

  upstream = http.createServer((_request, response) => {
    upstreamCalls++;
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end('upstream');
  });
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamPort = (upstream.address() as AddressInfo).port;
  upstreamOrigin = `http://127.0.0.1:${upstreamPort}`;

  consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  proxy = startServer({ target: upstreamOrigin, port: 13_778 });
  await new Promise<void>((resolve) => {
    if (proxy.listening) resolve();
    else proxy.once('listening', resolve);
  });
  proxyOrigin = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await close(proxy);
  await close(upstream);
  consoleLog.mockRestore();
});

const segmentArbitrary = fc.stringMatching(/^[a-z0-9]{1,20}$/);

describe('routing and composition fuzzing', () => {
  it('isolates generated methods while ignoring query strings', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('GET', 'POST', 'PUT'),
        segmentArbitrary,
        fc.string({ maxLength: 40 }),
        async (method, segment, query) => {
          await proxy.reloadConfig({
            target: upstreamOrigin,
            routes: {
              'GET /items/:id': [
                { fuzzMark: { label: 'GET' } },
                { fuzzShort: { status: 209, body: 'get' } },
              ],
              'POST /items/:id': [
                { fuzzMark: { label: 'POST' } },
                { fuzzShort: { status: 210, body: 'post' } },
              ],
            },
          });
          const callsBefore = upstreamCalls;

          const response = await fetch(
            `${proxyOrigin}/items/${segment}?value=${encodeURIComponent(query)}`,
            { method },
          );

          if (method === 'GET' || method === 'POST') {
            expect(response.status).toBe(method === 'GET' ? 209 : 210);
            expect(response.headers.get('x-fuzz-order')).toBe(method);
            expect(upstreamCalls).toBe(callsBefore);
          } else {
            expect(response.status).toBe(200);
            expect(response.headers.get('x-fuzz-order')).toBeNull();
            expect(upstreamCalls).toBe(callsBefore + 1);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('runs arbitrary global and matching-route depths in exact order before short circuiting', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 15 }),
        fc.integer({ min: 0, max: 15 }),
        async (globalDepth, routeDepth) => {
          const global = Array.from({ length: globalDepth }, (_, index) => ({
            fuzzMark: { label: `G${index}` },
          }));
          const route = [
            ...Array.from({ length: routeDepth }, (_, index) => ({
              fuzzMark: { label: `R${index}` },
            })),
            { fuzzShort: { status: 218, body: 'short' } },
          ];
          await proxy.reloadConfig({
            target: upstreamOrigin,
            global,
            routes: { 'GET /matched': route },
          });
          const callsBefore = upstreamCalls;

          const response = await fetch(`${proxyOrigin}/matched`);

          expect(response.status).toBe(218);
          expect(response.headers.get('x-fuzz-order') ?? '').toBe(
            [
              ...Array.from({ length: globalDepth }, (_, index) => `G${index}`),
              ...Array.from({ length: routeDepth }, (_, index) => `R${index}`),
            ].join(','),
          );
          expect(upstreamCalls).toBe(callsBefore);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('applies method-less generated routes to every supported method', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'),
        segmentArbitrary,
        async (method, segment) => {
          await proxy.reloadConfig({
            target: upstreamOrigin,
            routes: {
              '/all/:id': [
                { fuzzMark: { label: 'ALL' } },
                { fuzzShort: { status: 217, body: 'all' } },
              ],
            },
          });

          const response = await fetch(`${proxyOrigin}/all/${segment}`, { method });

          expect(response.status).toBe(217);
          expect(response.headers.get('x-fuzz-order')).toBe('ALL');
        },
      ),
      { numRuns: 300 },
    );
  });

  it('preserves onion ordering for arbitrary middleware depths', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 30 }), async (depth) => {
        await proxy.reloadConfig({
          target: upstreamOrigin,
          global: [
            ...Array.from({ length: depth }, (_, index) => ({
              fuzzOnion: { label: String(index) },
            })),
            { fuzzShort: { status: 216, body: 'onion' } },
          ],
        });

        const response = await fetch(`${proxyOrigin}/onion`);

        expect(response.status).toBe(216);
        expect(response.headers.get('x-fuzz-onion') ?? '').toBe(
          [
            ...Array.from({ length: depth }, (_, index) => `enter-${index}`),
            ...Array.from({ length: depth }, (_, index) => `exit-${depth - index - 1}`),
          ].join(','),
        );
      }),
      { numRuns: 300 },
    );
  });
});
