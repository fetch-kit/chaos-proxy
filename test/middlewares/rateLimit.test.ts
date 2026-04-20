import { describe, it, expect, vi } from 'vitest';
import { rateLimit } from '../../src/middlewares/rateLimit';

import type { Context } from 'koa';

type CapturedOptions = {
  id?: (ctx: Context) => string;
};

const { captured } = vi.hoisted(() => ({
  captured: {} as CapturedOptions,
}));

vi.mock('koa-ratelimit', () => {
  return {
    default: (opts: CapturedOptions) => {
      captured.id = opts.id;
      return () => undefined;
    },
  };
});

describe('rateLimit wrapper', () => {
  it('creates middleware with custom key function', () => {
    const keyFn = (ctx: Context) => {
      const val = ctx.headers?.['x-custom'];
      return Array.isArray(val) ? val.join(',') : (val ?? '');
    };
    const mw = rateLimit({ limit: 1, windowMs: 1000, key: keyFn });
    expect(typeof mw).toBe('function');
  });

  it('creates middleware with header key', () => {
    const mw = rateLimit({ limit: 1, windowMs: 1000, key: 'x-api-key' });
    expect(typeof mw).toBe('function');
  });

  it('uses header key getter with ip fallback (lines 18-19)', () => {
    rateLimit({ limit: 1, windowMs: 1000, key: 'x-api-key' });
    expect(typeof captured.id).toBe('function');

    const withHeader = {
      get: (name: string) => (name === 'x-api-key' ? 'abc123' : ''),
      ip: '1.2.3.4',
    } as unknown as Context;
    expect(captured.id?.(withHeader)).toBe('abc123');

    const withoutHeader = {
      get: () => '',
      ip: '1.2.3.4',
    } as unknown as Context;
    expect(captured.id?.(withoutHeader)).toBe('1.2.3.4');
  });

  it('creates middleware with default IP key', () => {
    const mw = rateLimit({ limit: 1, windowMs: 1000 });
    expect(typeof mw).toBe('function');
  });
});
