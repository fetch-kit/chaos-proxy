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

  it('is deterministic for the same seed', async () => {
    vi.useFakeTimers();
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    const runSeq = async () => {
      const delays: number[] = [];
      const startIndex = timeoutSpy.mock.calls.length;
      const mw = latencyRange(10, 30, 42);
      for (let i = 0; i < 6; i++) {
        const ctx = createMockCtx();
        const p = mw(ctx, async () => {});
        await vi.runAllTimersAsync();
        await p;
      }
      for (const call of timeoutSpy.mock.calls.slice(startIndex)) {
        const delay = Number(call[1]);
        if (!Number.isNaN(delay)) delays.push(delay);
      }
      return delays;
    };

    const a = await runSeq();
    const b = await runSeq();
    expect(a).toEqual(b);

    timeoutSpy.mockRestore();
    vi.useRealTimers();
  });

  it('changes delay sequence with different seeds', async () => {
    vi.useFakeTimers();
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    const runSeq = async (seed: number) => {
      const delays: number[] = [];
      const startIndex = timeoutSpy.mock.calls.length;
      const mw = latencyRange(10, 30, seed);
      for (let i = 0; i < 6; i++) {
        const ctx = createMockCtx();
        const p = mw(ctx, async () => {});
        await vi.runAllTimersAsync();
        await p;
      }
      for (const call of timeoutSpy.mock.calls.slice(startIndex)) {
        const delay = Number(call[1]);
        if (!Number.isNaN(delay)) delays.push(delay);
      }
      return delays;
    };

    const a = await runSeq(100);
    const b = await runSeq(101);
    expect(a).not.toEqual(b);

    timeoutSpy.mockRestore();
    vi.useRealTimers();
  });
});
