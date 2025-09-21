import { describe, it, expect } from 'vitest';
import { registerBuiltins } from './builtin';
import { resolveMiddleware } from './middleware';
// ...existing code...

describe('registerBuiltins', () => {
  it('registers all built-in middlewares', () => {
    registerBuiltins();
    expect(typeof resolveMiddleware({ latency: { ms: 100 } })).toBe('function');
    expect(typeof resolveMiddleware({ latencyRange: { minMs: 10, maxMs: 20 } })).toBe('function');
    expect(typeof resolveMiddleware({ failRandomly: { rate: 0.1 } })).toBe('function');
    expect(typeof resolveMiddleware({ dropConnection: {} })).toBe('function');
    expect(typeof resolveMiddleware({ fail: { status: 500 } })).toBe('function');
  });
});
