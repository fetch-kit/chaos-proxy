import { describe, it, expect } from 'vitest';
import { registerMiddleware, resolveMiddleware } from '../../src/registry/middleware';
import type { Context } from 'koa';

describe('middleware registry', () => {
  it('registers and resolves a middleware', async () => {
    const mockFactory = () => {
      return async (ctx: Context, next: () => Promise<void>) => { await next(); };
    };
    registerMiddleware('mock', mockFactory);
    const node: Record<string, unknown> = { mock: { foo: 'bar' } };
    const mw = resolveMiddleware(node);
    expect(typeof mw).toBe('function');
    // Test invocation
    const ctx = {} as Context;
    let called = false;
    await mw(ctx, async () => { called = true; });
    expect(called).toBe(true);
  });

  it('throws for unknown middleware', () => {
    const node: Record<string, unknown> = { notRegistered: {} };
    expect(() => resolveMiddleware(node)).toThrow(/Unknown middleware/);
  });

  it('throws for node with multiple keys', () => {
    const node: Record<string, unknown> = { a: {}, b: {} };
    expect(() => resolveMiddleware(node)).toThrow(/exactly one key/);
  });

  it('throws for invalid node type', () => {
    // Pass a value that is an object but not a valid middleware node
    expect(() => resolveMiddleware({})).toThrow(/exactly one key/);
  });

  it('passes options to factory', () => {
    let receivedOpts: Record<string, unknown> | null = null;
    registerMiddleware('optsTest', (_opts: Record<string, unknown>) => {
      receivedOpts = _opts;
      return async (ctx: Context, next: () => Promise<void>) => { await next(); };
    });
    const node: Record<string, unknown> = { optsTest: { test: 123 } };
    resolveMiddleware(node);
    expect(receivedOpts).toEqual({ test: 123 });
  });
});
