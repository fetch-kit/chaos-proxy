import fc from 'fast-check';
import type { Context, Middleware } from 'koa';
import { describe, expect, it, vi } from 'vitest';

type CapturedOptions = {
  db?: unknown;
  duration?: number;
  id?: (ctx: Context) => string;
  max?: number;
};

const { capturedOptions } = vi.hoisted(() => ({
  capturedOptions: [] as CapturedOptions[],
}));

vi.mock('koa-ratelimit', () => ({
  default: (options: CapturedOptions): Middleware => {
    capturedOptions.push(options);
    return async (_ctx, next) => next();
  },
}));

import { rateLimit } from '../../src/middlewares/rateLimit';

const keyArbitrary = fc.string({ minLength: 1, maxLength: 40 });

describe('rate-limit wrapper fuzzing', () => {
  it('makes equivalent header and function selectors produce the same generated keys', () => {
    fc.assert(
      fc.property(
        keyArbitrary,
        fc.string({ maxLength: 80 }),
        fc.string({ minLength: 1, maxLength: 80 }),
        fc.boolean(),
        (headerName, headerValue, ip, hasHeader) => {
          rateLimit({ limit: 1, windowMs: 1_000, key: headerName });
          const headerSelector = capturedOptions.at(-1)?.id;
          rateLimit({
            limit: 1,
            windowMs: 1_000,
            key: (ctx) => ctx.get(headerName) || ctx.ip || 'unknown',
          });
          const functionSelector = capturedOptions.at(-1)?.id;
          const ctx = {
            get: (name: string) => (hasHeader && name === headerName ? headerValue : ''),
            ip,
          } as unknown as Context;

          expect(headerSelector?.(ctx)).toBe(functionSelector?.(ctx));
        },
      ),
      { numRuns: 500 },
    );
  });

  it('uses the generated IP or unknown fallback when no key is configured', () => {
    fc.assert(
      fc.property(fc.option(fc.string({ minLength: 1, maxLength: 80 }), { nil: '' }), (ip) => {
        rateLimit({ limit: 1, windowMs: 1_000 });
        const selector = capturedOptions.at(-1)?.id;
        const ctx = { ip } as unknown as Context;

        expect(selector?.(ctx)).toBe(ip || 'unknown');
      }),
      { numRuns: 500 },
    );
  });

  it('forwards arbitrary bounds exactly and creates an isolated cache per middleware', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100_000 }),
        fc.integer({ min: 1, max: 86_400_000 }),
        (limit, windowMs) => {
          rateLimit({ limit, windowMs });
          const first = capturedOptions.at(-1);
          rateLimit({ limit, windowMs });
          const second = capturedOptions.at(-1);

          expect(first?.max).toBe(limit);
          expect(first?.duration).toBe(windowMs);
          expect(second?.max).toBe(limit);
          expect(second?.duration).toBe(windowMs);
          expect(first?.db).not.toBe(second?.db);
        },
      ),
      { numRuns: 500 },
    );
  });
});
