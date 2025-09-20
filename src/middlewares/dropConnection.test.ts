import { describe, it, expect, vi } from 'vitest';
import { dropConnection } from './dropConnection';

describe('dropConnection middleware', () => {
  it('destroys socket with given probability', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const destroy = vi.fn();
    const res = {
      socket: { destroy },
      status: () => res,
      send: () => res,
      end: vi.fn(),
      setHeader: vi.fn(),
      json: vi.fn(),
    } as any;
    const next = vi.fn();
    const mw = dropConnection({ prob: 0.2 });
  const req = { get: () => undefined, header: () => undefined } as any;
  mw(req, res, next);
    expect(destroy).toHaveBeenCalled();
    vi.restoreAllMocks();
  });
  it('calls next if not dropping', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const destroy2 = vi.fn();
    const res2 = {
      socket: { destroy: destroy2 },
      status: () => res2,
      send: () => res2,
      end: vi.fn(),
      setHeader: vi.fn(),
      json: vi.fn(),
    } as any;
    const next2 = vi.fn();
    const mw = dropConnection({ prob: 0.2 });
  const req2 = { get: () => undefined, header: () => undefined } as any;
    mw(req2, res2, next2);
  expect(next2).toHaveBeenCalled();
    vi.restoreAllMocks();
  });
  it('ends response if no socket', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const end = vi.fn();
    const res3 = {
      end,
      status: () => res3,
      send: () => res3,
      setHeader: vi.fn(),
      json: vi.fn(),
    } as any;
    const next3 = vi.fn();
    const mw = dropConnection({ prob: 1 });
  const req3 = { get: () => undefined, header: () => undefined } as any;
    mw(req3, res3, next3);
    expect(end).toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
