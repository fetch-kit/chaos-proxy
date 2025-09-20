import { describe, it, expect, vi } from 'vitest';
import { latencyRange } from './latencyRange';
import type { Request, Response } from 'express';

describe('latencyRange middleware', () => {
  it('delays between minMs and maxMs (using fake timers)', () => {
    vi.useFakeTimers();
    const next = vi.fn();
    const mw = latencyRange(10, 30);
    const req = { get: () => undefined, header: () => undefined } as unknown as Request;
    const res = {
      status: () => res,
      send: () => res,
      end: () => res,
      setHeader: () => res,
      json: () => res,
    } as unknown as Response;
    mw(req, res, next);
    // Advance timers by maxMs
    vi.advanceTimersByTime(30);
    expect(next).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
