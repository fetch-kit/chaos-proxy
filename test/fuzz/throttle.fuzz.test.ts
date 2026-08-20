import fc from 'fast-check';
import type { Context } from 'koa';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { throttle } from '../../src/middlewares/throttle';

function context(body: Readable, key = 'fuzz'): Context {
  return {
    body,
    ip: '127.0.0.1',
    get: (name: string) => (name === 'x-fuzz-key' ? key : ''),
  } as unknown as Context;
}

async function collect(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

const chunksArbitrary = fc.array(fc.uint8Array({ maxLength: 200 }), {
  minLength: 0,
  maxLength: 30,
});

describe('throttle stream fuzzing', () => {
  it('preserves arbitrary chunk partitions and sliced views byte for byte', async () => {
    await fc.assert(
      fc.asyncProperty(
        chunksArbitrary,
        fc.integer({ min: 1, max: 128 }),
        async (chunks, chunkSize) => {
          const expected = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
          const sourceChunks = chunks.map((chunk) => {
            const storage = Buffer.alloc(chunk.length + 4, 0xa5);
            Buffer.from(chunk).copy(storage, 2);
            return storage.subarray(2, 2 + chunk.length);
          });
          const ctx = context(Readable.from(sourceChunks));
          const middleware = throttle({
            rate: 1,
            chunkSize,
            burst: Math.max(1, expected.length),
            key: 'x-fuzz-key',
          });

          await middleware(ctx, async () => undefined);

          expect(await collect(ctx.body as Readable)).toEqual(expected);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('destroys an arbitrary active source when the throttled consumer cancels', async () => {
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ minLength: 1, maxLength: 200 }), async (prefix) => {
        let pushed = false;
        const source = new Readable({
          read() {
            if (!pushed) {
              pushed = true;
              this.push(Buffer.from(prefix));
            }
          },
        });
        const ctx = context(source);
        const middleware = throttle({
          rate: 1,
          chunkSize: 1,
          key: 'x-fuzz-key',
        });
        await middleware(ctx, async () => undefined);
        const output = ctx.body as Readable;
        output.resume();
        await new Promise<void>((resolve) => setImmediate(resolve));

        output.destroy();
        await new Promise<void>((resolve) => setImmediate(resolve));

        expect(source.destroyed).toBe(true);
      }),
      { numRuns: 300 },
    );
  });
});
