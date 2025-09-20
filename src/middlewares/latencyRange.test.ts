import { describe, it, expect, vi } from 'vitest';
import { latencyRange } from './latencyRange';

describe('latencyRange middleware', () => {
  it('delays between minMs and maxMs (using fake timers)', () => {
    vi.useFakeTimers();
    const next = vi.fn();
    const mw = latencyRange(10, 30);
    const req = { get: () => undefined, header: () => undefined } as any;
    const res = {
      status: () => res,
      send: () => res,
      end: () => res,
      setHeader: () => res,
      json: () => res,
    } as any;
    mw(req, res, next);
    // Advance timers by maxMs
    vi.advanceTimersByTime(30);
    expect(next).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
