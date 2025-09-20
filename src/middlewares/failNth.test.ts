import { describe, it, expect, vi } from 'vitest';
import { failNth } from './failNth';

describe('failNth middleware', () => {
  it('fails on the nth request and resets', () => {
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
    const mw = failNth({ n: 3, status: 500, body: 'fail!' });
    const req = { get: () => undefined, header: () => undefined } as any;
    mw(req, res, next); // 1
    mw(req, res, next); // 2
    mw(req, res, next); // 3 - should fail
    expect(status).toHaveBeenCalledWith(500);
    expect(send).toHaveBeenCalledWith('fail!');
    // Counter resets, next call should not fail
  status.mockClear(); send.mockClear();
  mw(req, res, next); // 1 again
  expect(status).not.toHaveBeenCalled();
  expect(next).toHaveBeenCalled();
  });
  it('defaults to 500 and default body', () => {
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
    const mw2 = failNth({ n: 2 });
    const req2 = { get: () => undefined, header: () => undefined } as any;
    mw2(req2, res2, next2); // 1
    mw2(req2, res2, next2); // 2 - should fail
      expect(status2).toHaveBeenCalledWith(500);
      expect(send2).toHaveBeenCalledWith('Failed on request #2');
  });
});
