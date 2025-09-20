import { describe, it, expect } from 'vitest';
import { rateLimit } from './rateLimit';

describe('rateLimit wrapper', () => {
  it('creates middleware with custom key function', () => {
    const keyFn = (req: any) => req.headers['x-custom'];
    const mw = rateLimit({ limit: 1, windowMs: 1000, key: keyFn, skipIpKeyCheck: true });
    expect(typeof mw).toBe('function');
  });

  it('creates middleware with header key', () => {
    const mw = rateLimit({ limit: 1, windowMs: 1000, key: 'x-api-key', skipIpKeyCheck: true });
    expect(typeof mw).toBe('function');
  });

  it('creates middleware with default IP key', () => {
    const mw = rateLimit({ limit: 1, windowMs: 1000 });
    expect(typeof mw).toBe('function');
  });
});
