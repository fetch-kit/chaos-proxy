import { describe, it, expect, vi } from 'vitest';
import { failNth } from '../../src/middlewares/failNth';
import type { Context } from 'koa';

describe('failNth middleware', () => {
  function createMockCtx(): Context {
    return {
      status: undefined,
      body: undefined,
      set: vi.fn(),
      method: 'GET',
    } as unknown as Context;
  }
  it('fails on the nth request and resets', async () => {
    const ctx = createMockCtx();
    const next = vi.fn();
    const mw = failNth({ n: 3, status: 500, body: 'fail!' });
    await mw(ctx, next); // 1
    await mw(ctx, next); // 2
    await mw(ctx, next); // 3 - should fail
    expect(ctx.status).toBe(500);
    expect(ctx.body).toBe('fail!');
    // Counter resets, next call should not fail
  ctx.status = 200;
    ctx.body = undefined;
    await mw(ctx, next); // 1 again
    expect(ctx.status).not.toBe(500);
    expect(next).toHaveBeenCalled();
  });
  it('defaults to 500 and default body', async () => {
    const ctx = createMockCtx();
    const next2 = vi.fn();
    const mw2 = failNth({ n: 2 });
    await mw2(ctx, next2); // 1
    await mw2(ctx, next2); // 2 - should fail
    expect(ctx.status).toBe(500);
    expect(ctx.body).toBe('Failed on request #2');
  });
});
