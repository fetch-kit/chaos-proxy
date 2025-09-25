import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { latency } from '../../src/middlewares/latency';
import type { Context } from 'koa';

describe('latency middleware', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  function createMockCtx(): Context {
    return {
      status: undefined,
      body: undefined,
      set: vi.fn(),
      method: 'GET',
    } as unknown as Context;
  }
  it('delays by the specified ms (using fake timers)', async () => {
    const next = vi.fn();
    const mw = latency(50);
    const ctx = createMockCtx();
    const promise = mw(ctx, next);
    vi.advanceTimersByTime(50);
    await promise;
    expect(next).toHaveBeenCalled();
  });
});
