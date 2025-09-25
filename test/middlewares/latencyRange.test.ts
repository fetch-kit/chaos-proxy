import { describe, it, expect, vi } from 'vitest';
import { latencyRange } from '../../src/middlewares/latencyRange';
import type { Context } from 'koa';

describe('latencyRange middleware', () => {
  function createMockCtx(): Context {
    return {
      status: undefined,
      body: undefined,
      set: vi.fn(),
      method: 'GET',
    } as unknown as Context;
  }
  it('delays between minMs and maxMs (using fake timers)', async () => {
    vi.useFakeTimers();
    const next = vi.fn();
    const mw = latencyRange(10, 30);
    const ctx = createMockCtx();
    const promise = mw(ctx, next);
    vi.advanceTimersByTime(30);
    await promise;
    expect(next).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
