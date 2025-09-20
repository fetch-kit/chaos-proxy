import { describe, it, expect, vi } from 'vitest';
import { failRandomly } from './failRandomly';
import type { Request, Response } from 'express';

describe('failRandomly middleware', () => {
  it('fails with given probability', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const send = vi.fn();
    const status = vi.fn(() => res);
    const res = {
      status,
      send,
      end: vi.fn(),
      setHeader: vi.fn(),
      json: vi.fn(),
    } as unknown as Response;
    const next = vi.fn();
    const mw = failRandomly({ rate: 0.2, status: 400, body: 'fail!' });
    const req = { get: () => undefined, header: () => undefined } as unknown as Request;
    mw(req, res, next);
    expect(status).toHaveBeenCalledWith(400);
    expect(send).toHaveBeenCalledWith('fail!');
    vi.restoreAllMocks();
  });
  it('calls next if not failing', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const res2 = {
      status: () => res2,
      send: () => res2,
      end: () => res2,
      setHeader: () => res2,
      json: () => res2,
    } as unknown as Response;
    const next2 = vi.fn();
    const mw2 = failRandomly({ rate: 0.2 });
    const req2 = { get: () => undefined, header: () => undefined } as unknown as Request;
    mw2(req2, res2, next2);
    expect(next2).toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
