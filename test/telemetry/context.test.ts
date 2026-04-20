import { describe, it, expect } from 'vitest';
import type { IncomingHttpHeaders } from 'http';
import type { Context } from 'koa';
import {
  parseTraceparent,
  formatTraceparent,
  extractTraceContext,
  injectTraceContext,
  setTraceContextInCtx,
} from '../../src/telemetry/context';

describe('parseTraceparent', () => {
  it('returns parsed context for a valid header', () => {
    const result = parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
    expect(result).toEqual({
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
      traceFlags: '01',
    });
  });

  it('returns null for invalid format', () => {
    expect(parseTraceparent('invalid')).toBeNull();
    expect(parseTraceparent('00-too-short-01')).toBeNull();
  });

  it('returns null if version is not 00', () => {
    expect(parseTraceparent('01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01')).toBeNull();
  });

  it('returns null if traceId is all zeros', () => {
    expect(parseTraceparent('00-00000000000000000000000000000000-00f067aa0ba902b7-01')).toBeNull();
  });

  it('returns null if spanId is all zeros', () => {
    expect(parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01')).toBeNull();
  });

  it('accepts uppercase hex (case-insensitive)', () => {
    const result = parseTraceparent('00-4BF92F3577B34DA6A3CE929D0E0E4736-00F067AA0BA902B7-01');
    expect(result).not.toBeNull();
    expect(result?.traceId).toBe('4BF92F3577B34DA6A3CE929D0E0E4736');
  });
});

describe('formatTraceparent', () => {
  it('formats a trace context to traceparent string', () => {
    expect(
      formatTraceparent({
        traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
        spanId: '00f067aa0ba902b7',
        traceFlags: '01',
      })
    ).toBe('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
  });
});

describe('extractTraceContext', () => {
  it('returns parsed context when traceparent header is present', () => {
    const headers: IncomingHttpHeaders = {
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    };
    const result = extractTraceContext(headers);
    expect(result).not.toBeNull();
    expect(result?.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
  });

  it('returns null when traceparent header is absent', () => {
    expect(extractTraceContext({})).toBeNull();
  });

  it('uses first element when header is an array', () => {
    const headers: IncomingHttpHeaders = {
      traceparent: [
        '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
        '00-aaaabbbbccccddddaaaabbbbccccdddd-1234567890abcdef-00',
      ],
    };
    const result = extractTraceContext(headers);
    expect(result?.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
  });
});

describe('injectTraceContext', () => {
  it('sets traceparent header on the headers object', () => {
    const headers: IncomingHttpHeaders = {};
    injectTraceContext(headers, {
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
      traceFlags: '01',
    });
    expect(headers['traceparent']).toBe('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
  });
});

describe('setTraceContextInCtx', () => {
  it('sets traceContext on ctx.state', () => {
    const ctx = { state: {} } as unknown as Context;
    const tc = { traceId: 'abc', spanId: 'def', traceFlags: '01' };
    setTraceContextInCtx(ctx, tc);
    expect(ctx.state.traceContext).toBe(tc);
  });
});
