import { describe, it, expect } from 'vitest';
import { rateLimit } from './rateLimit';

import type { Context } from 'koa';

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

  it('creates middleware with default IP key', () => {
    const mw = rateLimit({ limit: 1, windowMs: 1000 });
    expect(typeof mw).toBe('function');
  });
});
