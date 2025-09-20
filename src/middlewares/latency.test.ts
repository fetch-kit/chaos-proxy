import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { latency } from './latency';

describe('latency middleware', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it('delays by the specified ms (using fake timers)', () => {
    const next = vi.fn();
    const mw = latency(50);
    const start = Date.now();
    const req = { get: () => undefined, header: () => undefined } as any;
    const res = {
      status: () => res,
      send: () => res,
      end: () => res,
      setHeader: () => res,
      json: () => res,
    } as any;
    mw(req, res, next);
    vi.advanceTimersByTime(50);
    expect(next).toHaveBeenCalled();
  });
});
