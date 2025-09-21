import { describe, it, expect, vi } from 'vitest';
import { fail } from './fail';
import type { Request, Response } from 'express';

describe('fail middleware', () => {
  it('responds with status and body', () => {
    const send = vi.fn();
    const status = vi.fn(() => res);
    const res = {
      status,
      send,
      end: vi.fn(),
      setHeader: vi.fn(),
      json: vi.fn(),
    } as unknown as Response;
    const mw = fail({ status: 418, body: 'fail!' });
    const req = { get: () => undefined, header: () => undefined } as unknown as Request;
    mw(req, res, vi.fn());
    expect(status).toHaveBeenCalledWith(418);
    expect(send).toHaveBeenCalledWith('fail!');
  });
  it('defaults to 503 and default body', () => {
    const send2 = vi.fn();
    const status2 = vi.fn(() => res2);
    const res2 = {
      status: status2,
      send: send2,
      end: vi.fn(),
      setHeader: vi.fn(),
      json: vi.fn(),
    } as unknown as Response;
    const mw2 = fail({});
    const req2 = { get: () => undefined, header: () => undefined } as unknown as Request;
    mw2(req2, res2, vi.fn());
    expect(status2).toHaveBeenCalledWith(503);
    expect(send2).toHaveBeenCalledWith('Failed by chaos-proxy');
  });
});
