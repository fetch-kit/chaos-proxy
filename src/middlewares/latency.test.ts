import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { latency } from './latency';
import type { Request, Response } from 'express';

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
    const req = { get: () => undefined, header: () => undefined } as unknown as Request;
    const res = {
      status: () => res,
      send: () => res,
      end: () => res,
      setHeader: () => res,
      json: () => res,
    } as unknown as Response;
    mw(req, res, next);
    vi.advanceTimersByTime(50);
    expect(next).toHaveBeenCalled();
  });
});
