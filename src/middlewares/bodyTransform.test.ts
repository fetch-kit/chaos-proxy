
import { describe, it, expect } from 'vitest';
import { bodyTransform } from './bodyTransform';
import type { Context } from 'koa';

function createMockCtx(body: unknown, contentType = 'application/json'): Context {
  return {
    request: {
      body,
      headers: { 'content-type': contentType },
    },
    body: undefined,
    set: () => {},
    method: 'POST',
  } as unknown as Context;
}

describe('bodyTransform middleware', () => {
  it('mutates JSON body', async () => {
    const mw = bodyTransform({
      transform: (body) => {
        if (typeof body === 'object' && body !== null) {
          (body as Record<string, unknown>).mutated = true;
        }
        return body;
      },
    });
    const ctx = createMockCtx({ foo: 'bar' });
    await mw(ctx, async () => {});
    expect(ctx.request.body).toEqual({ foo: 'bar', mutated: true });
  });

  it('handles non-object bodies', async () => {
    const mw = bodyTransform({
      transform: () => 'changed',
    });
    const ctx = createMockCtx('original', 'text/plain');
    await mw(ctx, async () => {});
    expect(ctx.request.body).toBe('changed');
  });

  it('returns undefined if transform returns undefined', async () => {
    const mw = bodyTransform({
      transform: () => undefined,
    });
    const ctx = createMockCtx({ foo: 'bar' });
    await mw(ctx, async () => {});
    expect(ctx.request.body).toBeUndefined();
  });

  it('accepts a string arrow function for transform', async () => {
    const mw = bodyTransform('(body, ctx) => { body.added = 123; return body; }');
    const ctx = createMockCtx({ test: true });
    await mw(ctx, async () => {});
    expect(ctx.request.body).toEqual({ test: true, added: 123 });
  });

  it('accepts a string function body for transform', async () => {
    const mw = bodyTransform('body.foo = "baz"; return body;');
    const ctx = createMockCtx({ foo: 'bar' });
    await mw(ctx, async () => {});
    expect(ctx.request.body).toEqual({ foo: 'baz' });
  });

  it('throws for invalid function string', async () => {
    expect(() => bodyTransform('not valid js')).toThrow();
  });
});
