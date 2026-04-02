import { throttle } from '../../src/middlewares/throttle';
import type { ThrottleOptions } from '../../src/middlewares/throttle';
import { Readable, Writable } from 'stream';
import type { Context } from 'koa';
import { describe, it, expect } from 'vitest';

function createMockCtx(body: Readable): Context {
  return {
    body,
    ip: '127.0.0.1',
    get: () => '',
  } as unknown as Context;
}

async function runThroughThrottle(mw: ReturnType<typeof throttle>, size: number): Promise<number> {
  const input = Readable.from(Buffer.alloc(size, 'x'));
  const output: Buffer[] = [];
  const writable = new Writable({
    write(chunk, _enc, cb) {
      output.push(chunk);
      cb();
    },
  });

  const ctx = createMockCtx(input);
  const start = Date.now();
  await mw(ctx, async () => {});
  await new Promise((resolve) => (ctx.body as Readable).pipe(writable).on('finish', resolve));
  expect(Buffer.concat(output).length).toBe(size);
  return (Date.now() - start) / 1000;
}

describe('throttle middleware', () => {
  it('throttles output to configured rate', async () => {
    const rate = 1024; // 1KB/s
    const chunkSize = 512;
    const burst = 0;
    const opts: ThrottleOptions = { rate, chunkSize, burst };
    const mw = throttle(opts);

    // Create a readable stream with 2048 bytes
    const input = Readable.from(Buffer.alloc(2048, 'a'));
    const output: Buffer[] = [];
    const writable = new Writable({
      write(chunk, _enc, cb) {
        output.push(chunk);
        cb();
      },
    });

    const ctx = createMockCtx(input);
    const start = Date.now();
    await mw(ctx, async () => {});
  await new Promise((resolve) => (ctx.body as Readable).pipe(writable).on('finish', resolve));
    const elapsed = (Date.now() - start) / 1000;
    // Should take at least 2 seconds for 2048 bytes at 1024 bytes/sec
    expect(elapsed).toBeGreaterThanOrEqual(2);
    expect(Buffer.concat(output).length).toBe(2048);
  });

  it('allows burst before throttling', async () => {
    const rate = 1024;
    const chunkSize = 512;
    const burst = 1024;
    const opts: ThrottleOptions = { rate, chunkSize, burst };
    const mw = throttle(opts);

    const input = Readable.from(Buffer.alloc(2048, 'b'));
    const output: Buffer[] = [];
    const writable = new Writable({
      write(chunk, _enc, cb) {
        output.push(chunk);
        cb();
      },
    });

    const ctx = createMockCtx(input);
    const start = Date.now();
    await mw(ctx, async () => {});
  await new Promise((resolve) => (ctx.body as Readable).pipe(writable).on('finish', resolve));
    const elapsed = (Date.now() - start) / 1000;
    // Should take at least 1 second for the throttled part (after burst)
    expect(elapsed).toBeGreaterThanOrEqual(1);
    expect(Buffer.concat(output).length).toBe(2048);
  });

  it('does nothing if ctx.body is null or undefined', async () => {
    const opts: ThrottleOptions = { rate: 1024 };
    const mw = throttle(opts);
    const ctx = { body: null, ip: '127.0.0.1', get: () => '' } as unknown as Context;
    await mw(ctx, async () => {});
    expect(ctx.body).toBeNull();
  });

  it('throttles a string body by wrapping it in a stream', async () => {
    const opts: ThrottleOptions = { rate: 1024 * 1024 }; // high rate so test is fast
    const mw = throttle(opts);
    const ctx = { body: 'hello world', ip: '127.0.0.1', get: () => '' } as unknown as Context;
    await mw(ctx, async () => {});
    // body should now be a readable stream (ThrottleStream)
    expect(typeof (ctx.body as { pipe?: unknown }).pipe).toBe('function');
  });

  it('throttles a Buffer body by wrapping it in a stream', async () => {
    const opts: ThrottleOptions = { rate: 1024 * 1024 }; // high rate so test is fast
    const mw = throttle(opts);
    const buf = Buffer.from('hello buffer');
    const ctx = { body: buf, ip: '127.0.0.1', get: () => '' } as unknown as Context;
    await mw(ctx, async () => {});
    expect(typeof (ctx.body as { pipe?: unknown }).pipe).toBe('function');
    // drain stream and verify content is preserved
    const output: Buffer[] = [];
    const writable = new Writable({ write(chunk, _enc, cb) { output.push(chunk); cb(); } });
    await new Promise((resolve) => (ctx.body as Readable).pipe(writable).on('finish', resolve));
    expect(Buffer.concat(output).toString()).toBe('hello buffer');
  });

  it('shares burst budget across sequential responses for the same key', async () => {
    const rate = 1024;
    const chunkSize = 512;
    const burst = 1024;
    const opts: ThrottleOptions = { rate, chunkSize, burst };
    const mw = throttle(opts);

    // First response should be mostly covered by burst.
    const firstElapsed = await runThroughThrottle(mw, 1024);
    // Second immediate response should be throttled (burst already consumed).
    const secondElapsed = await runThroughThrottle(mw, 1024);

    expect(firstElapsed).toBeLessThan(0.5);
    expect(secondElapsed).toBeGreaterThanOrEqual(0.8);
    expect(secondElapsed).toBeGreaterThan(firstElapsed + 0.5);
  });
});
