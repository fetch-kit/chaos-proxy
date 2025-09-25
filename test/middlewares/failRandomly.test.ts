import { describe, it, expect, vi } from 'vitest';
import { failRandomly } from '../../src/middlewares/failRandomly';
import type { Context } from 'koa';

describe('failRandomly middleware', () => {
  function createMockCtx(): Context {
    return {
      status: undefined,
      body: undefined,
      set: vi.fn(),
      method: 'GET',
    } as unknown as Context;
  }
  it('fails with given probability', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const ctx = createMockCtx();
    const mw = failRandomly({ rate: 0.2, status: 400, body: 'fail!' });
    await mw(ctx, async () => {});
    expect(ctx.status).toBe(400);
    expect(ctx.body).toBe('fail!');
    vi.restoreAllMocks();
  });
  it('calls next if not failing', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const ctx = createMockCtx();
    const next2 = vi.fn();
    const mw2 = failRandomly({ rate: 0.2 });
    await mw2(ctx, next2);
    expect(next2).toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
