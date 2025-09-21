import { describe, it, expect } from 'vitest';
import { cors } from './cors';
import type { Request } from 'express';

describe('cors middleware', () => {
  function mockRes() {
    const headers: Record<string, string> = {};
    return {
      setHeader: (key: string, value: string) => {
        headers[key] = value;
      },
      status: function (code: number) {
        this.statusCode = code;
        return this;
      },
      end: function () {
        this.ended = true;
      },
      statusCode: undefined as number | undefined,
      ended: false,
      headers,
    };
  }

  it('sets default CORS headers', () => {
    const mw = cors();
    const req = { method: 'GET' } as Request;
    const res = mockRes();
    let nextCalled = false;
    // @ts-expect-error: mock response does not fully implement Express.Response
    mw(req, res, () => {
      nextCalled = true;
    });
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(res.headers['Access-Control-Allow-Methods']).toBe('GET,POST,PUT,DELETE,OPTIONS');
    expect(res.headers['Access-Control-Allow-Headers']).toBe('Content-Type,Authorization');
    expect(nextCalled).toBe(true);
  });

  it('sets custom CORS headers', () => {
    const mw = cors({ origin: 'http://example.com', methods: 'GET', headers: 'X-Test' });
    const req = { method: 'GET' } as Request;
    const res = mockRes();
    let nextCalled = false;
    // @ts-expect-error: mock response does not fully implement Express.Response
    mw(req, res, () => {
      nextCalled = true;
    });
    expect(res.headers['Access-Control-Allow-Origin']).toBe('http://example.com');
    expect(res.headers['Access-Control-Allow-Methods']).toBe('GET');
    expect(res.headers['Access-Control-Allow-Headers']).toBe('X-Test');
    expect(nextCalled).toBe(true);
  });

  it('handles OPTIONS preflight requests', () => {
    const mw = cors();
    const req = { method: 'OPTIONS' } as Request;
    const res = mockRes();
    // @ts-expect-error: mock response does not fully implement Express.Response
    mw(req, res, () => {});
    expect(res.statusCode).toBe(204);
    expect(res.ended).toBe(true);
  });
});
