import { describe, it, expect } from 'vitest';
import { rateLimit } from './rateLimit';

describe('rateLimit wrapper', () => {
  it('creates middleware with custom key function', () => {
    const keyFn = (req: unknown) => {
      if (typeof req === 'object' && req !== null && 'headers' in req) {
        // Type assertion for headers property
        return (req as { headers: Record<string, string> }).headers['x-custom'] ?? '';
      }
      return '';
    };
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
