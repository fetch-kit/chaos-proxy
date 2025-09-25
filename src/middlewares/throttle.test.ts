import { throttle } from './throttle';
import type { ThrottleOptions } from './throttle';
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

  it('does nothing if ctx.body is not a stream', async () => {
    const opts: ThrottleOptions = { rate: 1024 };
    const mw = throttle(opts);
    const ctx = { body: 'not a stream', ip: '127.0.0.1', get: () => '' } as unknown as Context;
    await mw(ctx, async () => {});
    expect(ctx.body).toBe('not a stream');
  });
});
