import { describe, it, expect, vi } from 'vitest';
import { cors } from './cors';
import type { Context } from 'koa';

describe('cors middleware', () => {
  function createMockCtx(method: string = 'GET'): Context {
    const headers: Record<string, string> = {};
    return {
      set: (key: string, value: string) => {
        headers[key] = value;
      },
      method,
      status: undefined,
      body: undefined,
      headers,
    } as unknown as Context;
  }

  it('sets default CORS headers', async () => {
    const mw = cors();
    const ctx = createMockCtx('GET');
    const next = vi.fn();
    await mw(ctx, next);
    expect(ctx.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(ctx.headers['Access-Control-Allow-Methods']).toBe('GET,POST,PUT,DELETE,OPTIONS');
    expect(ctx.headers['Access-Control-Allow-Headers']).toBe('Content-Type,Authorization');
    expect(next).toHaveBeenCalled();
  });

  it('sets custom CORS headers', async () => {
    const mw = cors({ origin: 'http://example.com', methods: 'GET', headers: 'X-Test' });
    const ctx = createMockCtx('GET');
    const next = vi.fn();
    await mw(ctx, next);
    expect(ctx.headers['Access-Control-Allow-Origin']).toBe('http://example.com');
    expect(ctx.headers['Access-Control-Allow-Methods']).toBe('GET');
    expect(ctx.headers['Access-Control-Allow-Headers']).toBe('X-Test');
    expect(next).toHaveBeenCalled();
  });

  it('handles OPTIONS preflight requests', async () => {
    const mw = cors();
    const ctx = createMockCtx('OPTIONS');
    await mw(ctx, async () => {});
    expect(ctx.status).toBe(204);
    expect(ctx.body).toBeUndefined();
  });
});
