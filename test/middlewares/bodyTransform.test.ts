
import { describe, it, expect } from 'vitest';
import { bodyTransform } from '../../src/middlewares/bodyTransform';
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
  it('mutates JSON request body', async () => {
    const mw = bodyTransform({
      request: {
        transform: (body: unknown) => {
          if (typeof body === 'object' && body !== null) {
            (body as Record<string, unknown>).mutated = true;
          }
          return body;
        },
      },
    });
    const ctx = createMockCtx({ foo: 'bar' });
    await mw(ctx, async () => {});
    expect(ctx.request.body).toEqual({ foo: 'bar', mutated: true });
  });

  it('handles non-object request bodies', async () => {
    const mw = bodyTransform({
      request: {
  transform: () => 'changed',
      },
    });
    const ctx = createMockCtx('original', 'text/plain');
    await mw(ctx, async () => {});
    expect(ctx.request.body).toBe('changed');
  });

  it('returns undefined if request transform returns undefined', async () => {
    const mw = bodyTransform({
      request: {
  transform: () => undefined,
      },
    });
    const ctx = createMockCtx({ foo: 'bar' });
    await mw(ctx, async () => {});
    expect(ctx.request.body).toBeUndefined();
  });

  it('mutates response body', async () => {
    const mw = bodyTransform({
      response: {
        transform: (body: unknown) => {
          if (typeof body === 'object' && body !== null) {
            (body as Record<string, unknown>).mutated = true;
          }
          return body;
        },
      },
    });
    const ctx = createMockCtx(undefined);
    ctx.body = { foo: 'bar' };
    await mw(ctx, async () => {});
    expect(ctx.body).toEqual({ foo: 'bar', mutated: true });
  });

  it('handles non-object response bodies', async () => {
    const mw = bodyTransform({
      response: {
  transform: () => 'changed',
      },
    });
    const ctx = createMockCtx(undefined);
    ctx.body = 'original';
    await mw(ctx, async () => {});
    expect(ctx.body).toBe('changed');
  });

  it('returns undefined if response transform returns undefined', async () => {
    const mw = bodyTransform({
      response: {
  transform: () => undefined,
      },
    });
    const ctx = createMockCtx(undefined);
    ctx.body = { foo: 'bar' };
    await mw(ctx, async () => {});
    expect(ctx.body).toBeUndefined();
  });

  it('can use both request and response transforms', async () => {
    const mw = bodyTransform({
      request: {
        transform: (body: unknown) => {
          if (typeof body === 'object' && body !== null) {
            (body as Record<string, unknown>).req = true;
          }
          return body;
        },
      },
      response: {
        transform: (body: unknown) => {
          if (typeof body === 'object' && body !== null) {
            (body as Record<string, unknown>).res = true;
          }
          return body;
        },
      },
    });
    const ctx = createMockCtx({ foo: 'bar' });
    ctx.body = { bar: 'baz' };
    await mw(ctx, async () => {});
    expect(ctx.request.body).toEqual({ foo: 'bar', req: true });
    expect(ctx.body).toEqual({ bar: 'baz', res: true });
  });

  it('accepts a string arrow function for request transform', async () => {
    const mw = bodyTransform({ request: '(body, ctx) => { body.added = 123; return body; }' });
    const ctx = createMockCtx({ test: true });
    await mw(ctx, async () => {});
    expect(ctx.request.body).toEqual({ test: true, added: 123 });
  });

  it('accepts a string function body for request transform', async () => {
    const mw = bodyTransform({ request: 'body.foo = "baz"; return body;' });
    const ctx = createMockCtx({ foo: 'bar' });
    await mw(ctx, async () => {});
    expect(ctx.request.body).toEqual({ foo: 'baz' });
  });

  it('accepts a string arrow function for response transform', async () => {
    const mw = bodyTransform({ response: '(body, ctx) => { body.added = 456; return body; }' });
    const ctx = createMockCtx(undefined);
    ctx.body = { test: true };
    await mw(ctx, async () => {});
    expect(ctx.body).toEqual({ test: true, added: 456 });
  });

  it('accepts a string function body for response transform', async () => {
    const mw = bodyTransform({ response: 'body.foo = "baz"; return body;' });
    const ctx = createMockCtx(undefined);
    ctx.body = { foo: 'bar' };
    await mw(ctx, async () => {});
    expect(ctx.body).toEqual({ foo: 'baz' });
  });

  it('throws for invalid function string in request', async () => {
    expect(() => bodyTransform({ request: 'not valid js' })).toThrow();
  });

  it('throws for invalid function string in response', async () => {
    expect(() => bodyTransform({ response: 'not valid js' })).toThrow();
  });
});
