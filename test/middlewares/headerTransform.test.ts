import { describe, it, expect } from 'vitest';
import { headerTransform } from '../../src/middlewares/headerTransform';
import type { Context } from 'koa';

function createMockCtx(headers: Record<string, string | string[] | undefined> = {}, responseHeaders: Record<string, string | string[] | undefined> = {}): Context {
  return {
    request: {
      headers: { ...headers },
    },
    response: {
      headers: { ...responseHeaders },
    },
    set: () => {},
    method: 'GET',
  } as unknown as Context;
}

describe('headerTransform middleware', () => {
  it('mutates request headers', async () => {
    const mw = headerTransform({
      request: {
        transform: (headers) => {
          headers['x-mutated'] = 'yes';
          return headers;
        },
      },
    });
    const ctx = createMockCtx({ foo: 'bar' });
    await mw(ctx, async () => {});
    expect(ctx.request.headers['x-mutated']).toBe('yes');
  });

  it('mutates response headers', async () => {
    const mw = headerTransform({
      response: {
        transform: (headers) => {
          headers['x-res'] = 'done';
          return headers;
        },
      },
    });
    const ctx = createMockCtx({}, { foo: 'bar' });
    await mw(ctx, async () => {});
    expect(ctx.response.headers['x-res']).toBe('done');
  });

  it('can use both request and response transforms', async () => {
    const mw = headerTransform({
      request: {
        transform: (headers) => {
          headers['x-req'] = '1';
          return headers;
        },
      },
      response: {
        transform: (headers) => {
          headers['x-res'] = '2';
          return headers;
        },
      },
    });
    const ctx = createMockCtx({ foo: 'bar' }, { bar: 'baz' });
    await mw(ctx, async () => {});
    expect(ctx.request.headers['x-req']).toBe('1');
    expect(ctx.response.headers['x-res']).toBe('2');
  });

  it('accepts a string arrow function for request transform', async () => {
    const mw = headerTransform({ request: '(headers, ctx) => { headers["x-added"] = "abc"; return headers; }' });
    const ctx = createMockCtx({ foo: 'bar' });
    await mw(ctx, async () => {});
    expect(ctx.request.headers['x-added']).toBe('abc');
  });

  it('accepts a string function body for response transform', async () => {
    const mw = headerTransform({ response: 'headers["x-func"] = "body"; return headers;' });
    const ctx = createMockCtx({}, { foo: 'bar' });
    await mw(ctx, async () => {});
    expect(ctx.response.headers['x-func']).toBe('body');
  });

  it('throws for invalid function string in request', async () => {
    expect(() => headerTransform({ request: 'not valid js' })).toThrow();
  });

  it('throws for invalid function string in response', async () => {
    expect(() => headerTransform({ response: 'not valid js' })).toThrow();
  });
});
