import fc from 'fast-check';
import type { Context, Middleware } from 'koa';
import { describe, expect, it, vi } from 'vitest';
import { failFirstN } from '../../src/middlewares/failFirstN';
import { failNth } from '../../src/middlewares/failNth';
import { createRandom } from '../../src/middlewares/seededRandom';

function context(): Context {
  return {
    status: undefined,
    body: undefined,
    method: 'GET',
    set: vi.fn(),
  } as unknown as Context;
}

async function outcomes(middleware: Middleware, requestCount: number): Promise<boolean[]> {
  const failed: boolean[] = [];
  for (let request = 0; request < requestCount; request++) {
    const ctx = context();
    let delegated = false;
    await middleware(ctx, async () => {
      delegated = true;
    });
    failed.push(!delegated);
  }
  return failed;
}

describe('stateful middleware fuzzing', () => {
  it('failFirstN fails exactly the generated prefix', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 200 }),
        async (n, requestCount) => {
          const actual = await outcomes(failFirstN({ n }), requestCount);
          expect(actual).toEqual(
            Array.from({ length: requestCount }, (_, index) => index < n),
          );
        },
      ),
      { numRuns: 500 },
    );
  });

  it('failNth repeats with the generated period', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 0, max: 300 }),
        async (n, requestCount) => {
          const actual = await outcomes(failNth({ n }), requestCount);
          expect(actual).toEqual(
            Array.from({ length: requestCount }, (_, index) => (index + 1) % n === 0),
          );
        },
      ),
      { numRuns: 500 },
    );
  });

  it('keeps arbitrary failNth instances isolated when calls are interleaved', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 1, max: 20 }),
        fc.array(fc.boolean(), { minLength: 1, maxLength: 300 }),
        async (periodA, periodB, callA) => {
          const middlewareA = failNth({ n: periodA });
          const middlewareB = failNth({ n: periodB });
          let countA = 0;
          let countB = 0;

          for (const targetsA of callA) {
            const middleware = targetsA ? middlewareA : middlewareB;
            const count = targetsA ? ++countA : ++countB;
            const period = targetsA ? periodA : periodB;
            const [failed] = await outcomes(middleware, 1);
            expect(failed).toBe(count % period === 0);
          }
        },
      ),
      { numRuns: 500 },
    );
  });

  it('produces identical bounded sequences for arbitrary equal seeds', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.integer(), fc.string()),
        fc.integer({ min: 0, max: 500 }),
        (seed, count) => {
          const first = createRandom(seed);
          const second = createRandom(seed);
          const firstSequence = Array.from({ length: count }, () => first());
          const secondSequence = Array.from({ length: count }, () => second());

          expect(firstSequence).toEqual(secondSequence);
          for (const value of firstSequence) {
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(1);
          }
        },
      ),
      { numRuns: 1_000 },
    );
  });

  it('normalizes arbitrary numeric seeds to the documented uint32 state', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 1, max: 100 }), (seed, count) => {
        const original = createRandom(seed);
        const normalized = createRandom(Math.floor(seed) >>> 0);

        expect(Array.from({ length: count }, () => original())).toEqual(
          Array.from({ length: count }, () => normalized()),
        );
      }),
      { numRuns: 500 },
    );
  });

  it('keeps seeded generator state isolated under arbitrary interleavings', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.integer(), fc.string()),
        fc.array(fc.boolean(), { minLength: 1, maxLength: 500 }),
        (seed, advanceFirst) => {
          const first = createRandom(seed);
          const second = createRandom(seed);
          const expectedFirst = createRandom(seed);
          const expectedSecond = createRandom(seed);

          for (const chooseFirst of advanceFirst) {
            expect(chooseFirst ? first() : second()).toBe(
              chooseFirst ? expectedFirst() : expectedSecond(),
            );
          }
        },
      ),
      { numRuns: 500 },
    );
  });
});
