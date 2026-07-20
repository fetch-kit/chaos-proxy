import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  createRequestId,
  emitVerbose,
  extractTraceId,
  redactUrlQuery,
} from '../../src/logging/verbose';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('logging/verbose', () => {
  it('formats numeric and boolean fields in verbose output', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    emitVerbose(true, 'verbose.request.end', {
      duration_ms: 42,
      ok: true,
      optional: undefined,
      nothing: null,
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = String(logSpy.mock.calls[0]?.[0] ?? '');
    expect(line).toContain('event=verbose.request.end');
    expect(line).toContain('duration_ms=42');
    expect(line).toContain('ok=true');
    expect(line).toContain('nothing=null');
    expect(line).not.toContain('optional=');
  });

  it('uses console.error for WARN and ERROR levels', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    emitVerbose(true, 'verbose.request.end', { status: 503 }, 'WARN');
    emitVerbose(true, 'verbose.error', { class: 'upstream_request_error' }, 'ERROR');

    expect(errSpy).toHaveBeenCalledTimes(2);
    expect(String(errSpy.mock.calls[0]?.[0] ?? '')).toContain('level=WARN');
    expect(String(errSpy.mock.calls[1]?.[0] ?? '')).toContain('level=ERROR');
  });

  it('returns path only for empty query string', () => {
    expect(redactUrlQuery('/api/cc?')).toBe('/api/cc');
  });

  it('redacts sensitive query keys case-insensitively', () => {
    expect(redactUrlQuery('/api/cc?token=abc&Foo=bar&API_KEY=123')).toBe(
      '/api/cc?token=%5BREDACTED%5D&Foo=bar&API_KEY=%5BREDACTED%5D'
    );
  });

  it('extracts trace id from string and array traceparent headers', () => {
    const traceparent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';

    expect(extractTraceId({ traceparent })).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(extractTraceId({ traceparent: [traceparent] })).toBe(
      '4bf92f3577b34da6a3ce929d0e0e4736'
    );
  });

  it('returns undefined when traceparent is missing or invalid', () => {
    expect(extractTraceId({})).toBeUndefined();
    expect(extractTraceId({ traceparent: 'invalid-value' })).toBeUndefined();
  });

  it('creates request ids with expected prefix and length', () => {
    const id = createRequestId();
    expect(id.startsWith('rq_')).toBe(true);
    expect(id.length).toBe(11);
  });

  it('replaces control characters in field values with spaces', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    emitVerbose(true, 'verbose.request.begin', {
      path: 'a\u0007b\u007fc\td',
    });

    const line = String(logSpy.mock.calls[0]?.[0] ?? '');
    expect(line).not.toContain('\u0007');
    expect(line).not.toContain('\u007f');
    expect(line).toContain('event=verbose.request.begin');
  });
});
