import { describe, it, expect, vi } from 'vitest';
import { failRandomly } from './failRandomly';

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
    } as any;
    const next = vi.fn();
    const mw = failRandomly({ rate: 0.2, status: 400, body: 'fail!' });
    const req = { get: () => undefined, header: () => undefined } as any;
    mw(req, res, next);
    expect(status).toHaveBeenCalledWith(400);
    expect(send).toHaveBeenCalledWith('fail!');
    vi.restoreAllMocks();
  });
  it('calls next if not failing', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const send2 = vi.fn();
    const status2 = vi.fn(() => res2);
    const res2 = {
      status: status2,
      send: send2,
      end: vi.fn(),
      setHeader: vi.fn(),
      json: vi.fn(),
    } as any;
    const next2 = vi.fn();
    const mw2 = failRandomly({ rate: 0.2 });
    const req2 = { get: () => undefined, header: () => undefined } as any;
    mw2(req2, res2, next2);
    expect(next2).toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
