import { describe, it, expect, vi } from 'vitest';
import { failFirstN } from '../../src/middlewares/failFirstN';
import type { Context } from 'koa';

describe('failFirstN middleware', () => {
  function createMockCtx(): Context {
    return {
      status: undefined,
      body: undefined,
      set: vi.fn(),
      method: 'GET',
    } as unknown as Context;
  }

  it('fails the first N requests and then passes through', async () => {
    const mw = failFirstN({ n: 2, status: 429, body: 'too early' });

    const ctx1 = createMockCtx();
    const next1 = vi.fn();
    await mw(ctx1, next1);
    expect(ctx1.status).toBe(429);
    expect(ctx1.body).toBe('too early');
    expect(next1).not.toHaveBeenCalled();

    const ctx2 = createMockCtx();
    const next2 = vi.fn();
    await mw(ctx2, next2);
    expect(ctx2.status).toBe(429);
    expect(ctx2.body).toBe('too early');
    expect(next2).not.toHaveBeenCalled();

    const ctx3 = createMockCtx();
    const next3 = vi.fn();
    await mw(ctx3, next3);
    expect(ctx3.status).toBeUndefined();
    expect(ctx3.body).toBeUndefined();
    expect(next3).toHaveBeenCalled();

    const ctx4 = createMockCtx();
    const next4 = vi.fn();
    await mw(ctx4, next4);
    expect(ctx4.status).toBeUndefined();
    expect(ctx4.body).toBeUndefined();
    expect(next4).toHaveBeenCalled();
  });

  it('uses fail defaults when status/body are omitted', async () => {
    const mw = failFirstN({ n: 1 });
    const ctx = createMockCtx();
    const next = vi.fn();

    await mw(ctx, next);
    expect(ctx.status).toBe(503);
    expect(ctx.body).toBe('Failed by chaos-proxy');
    expect(next).not.toHaveBeenCalled();
  });

  it('does not call next while failing', async () => {
    const mw = failFirstN({ n: 1 });
    const ctx = createMockCtx();
    let nextCalled = false;

    await mw(ctx, async () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(ctx.status).toBe(503);
  });

  it('keeps counters isolated between middleware instances', async () => {
    const mwA = failFirstN({ n: 1, status: 418, body: 'a' });
    const mwB = failFirstN({ n: 1, status: 409, body: 'b' });

    const ctxA1 = createMockCtx();
    await mwA(ctxA1, vi.fn());
    expect(ctxA1.status).toBe(418);

    const ctxB1 = createMockCtx();
    await mwB(ctxB1, vi.fn());
    expect(ctxB1.status).toBe(409);

    const ctxA2 = createMockCtx();
    const nextA2 = vi.fn();
    await mwA(ctxA2, nextA2);
    expect(nextA2).toHaveBeenCalled();

    const ctxB2 = createMockCtx();
    const nextB2 = vi.fn();
    await mwB(ctxB2, nextB2);
    expect(nextB2).toHaveBeenCalled();
  });
});
