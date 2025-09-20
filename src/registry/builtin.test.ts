import { describe, it, expect, beforeEach } from 'vitest';
import { registerBuiltins } from './builtin';
import { resolveMiddleware } from './middleware';
import { resolvePreset } from './preset';

describe('registerBuiltins', () => {
  beforeEach(() => {
    // Optionally clear registries if your registry implementation supports it
    // For example: clearMiddlewareRegistry(); clearPresetRegistry();
  });

  it('registers all built-in middlewares', () => {
    registerBuiltins();
    expect(typeof resolveMiddleware({ latency: { ms: 100 } })).toBe('function');
    expect(typeof resolveMiddleware({ latencyRange: { minMs: 10, maxMs: 20 } })).toBe('function');
    expect(typeof resolveMiddleware({ failRandomly: { rate: 0.1 } })).toBe('function');
    expect(typeof resolveMiddleware({ dropConnection: {} })).toBe('function');
    expect(typeof resolveMiddleware({ fail: { status: 500 } })).toBe('function');
  });

  it('registers all built-in presets', () => {
    registerBuiltins();
    const slowNetwork = resolvePreset('slowNetwork');
    const flakyApi = resolvePreset('flakyApi');
    expect(Array.isArray(slowNetwork)).toBe(true);
    expect(Array.isArray(flakyApi)).toBe(true);
    expect(slowNetwork.length).toBeGreaterThan(0);
    expect(flakyApi.length).toBeGreaterThan(0);
  });
});
