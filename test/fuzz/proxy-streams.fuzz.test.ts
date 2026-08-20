import fc from 'fast-check';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startServer, type ChaosProxyServer } from '../../src/server';

let upstream: http.Server;
let proxy: ChaosProxyServer;
let proxyOrigin: URL;
let responseChunks: Buffer[] = [];
let bufferedResponse = false;
let consoleLog: ReturnType<typeof vi.spyOn>;

const close = (server: http.Server) =>
  new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

const collectRequest = (request: http.IncomingMessage) =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });

beforeAll(async () => {
  upstream = http.createServer(async (request, response) => {
    if (request.url === '/echo') {
      const body = await collectRequest(request);
      response.writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-length': body.length,
      });
      response.end(body);
      return;
    }

    const length = responseChunks.reduce((total, chunk) => total + chunk.length, 0);
    response.writeHead(
      200,
      bufferedResponse
        ? { 'content-type': 'application/octet-stream', 'content-length': length }
        : { 'content-type': 'application/octet-stream' },
    );
    for (const chunk of responseChunks) response.write(chunk);
    response.end();
  });
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const upstreamPort = (upstream.address() as AddressInfo).port;

  consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  proxy = startServer({ target: `http://127.0.0.1:${upstreamPort}`, port: 13_779 });
  await new Promise<void>((resolve) => {
    if (proxy.listening) resolve();
    else proxy.once('listening', resolve);
  });
  proxyOrigin = new URL(`http://127.0.0.1:${(proxy.address() as AddressInfo).port}`);
});

afterAll(async () => {
  await close(proxy);
  await close(upstream);
  consoleLog.mockRestore();
});

const chunksArbitrary = fc.array(fc.uint8Array({ maxLength: 300 }), {
  maxLength: 30,
});

function requestWithChunks(path: string, chunks: Buffer[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      new URL(path, proxyOrigin),
      { method: 'POST', headers: { 'content-type': 'application/octet-stream' } },
      (response) => {
        collectRequest(response).then(resolve, reject);
      },
    );
    request.on('error', reject);
    for (const chunk of chunks) request.write(chunk);
    request.end();
  });
}

describe('proxy stream fuzzing', () => {
  it('preserves arbitrary request chunk partitions byte for byte', async () => {
    await fc.assert(
      fc.asyncProperty(chunksArbitrary, async (chunks) => {
        const input = chunks.map((chunk) => Buffer.from(chunk));
        const expected = Buffer.concat(input);

        expect(await requestWithChunks('/echo', input)).toEqual(expected);
      }),
      { numRuns: 300 },
    );
  });

  it('preserves arbitrary buffered and streaming response partitions byte for byte', async () => {
    await fc.assert(
      fc.asyncProperty(chunksArbitrary, fc.boolean(), async (chunks, buffered) => {
        responseChunks = chunks.map((chunk) => Buffer.from(chunk));
        bufferedResponse = buffered;
        const expected = Buffer.concat(responseChunks);

        const response = await fetch(new URL('/generated', proxyOrigin));

        expect(Buffer.from(await response.arrayBuffer())).toEqual(expected);
      }),
      { numRuns: 300 },
    );
  });
});
