import { describe, it, expect, vi } from 'vitest';
import {
  generateTraceId,
  generateSpanId,
  msToNanos,
  createSpan,
  spanToOtlpJson,
} from '../../src/telemetry/span';

type OtlpAttribute = {
  key: string;
  value: {
    intValue?: number;
    stringValue?: string;
  };
};

type OtlpJson = {
  status: { code: string };
  attributes: OtlpAttribute[];
  parentSpanId?: string;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
};

function asOtlpJson(value: Record<string, unknown>): OtlpJson {
  return value as unknown as OtlpJson;
}

describe('generateTraceId', () => {
  it('returns a 32-char lowercase hex string', () => {
    const id = generateTraceId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('returns unique values on successive calls', () => {
    expect(generateTraceId()).not.toBe(generateTraceId());
  });

  it('falls back to Math.random when crypto.getRandomValues is unavailable (lines 31-34)', () => {
    const originalCrypto = globalThis.crypto;
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.1);
    vi.stubGlobal('crypto', {});

    try {
      const id = generateTraceId();
      expect(id).toMatch(/^[0-9a-f]{32}$/);
      expect(randomSpy).toHaveBeenCalledTimes(32);
    } finally {
      randomSpy.mockRestore();
      vi.stubGlobal('crypto', originalCrypto);
    }
  });
});

describe('generateSpanId', () => {
  it('returns a 16-char lowercase hex string', () => {
    const id = generateSpanId();
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('falls back to Math.random when crypto.getRandomValues is unavailable (lines 45-48)', () => {
    const originalCrypto = globalThis.crypto;
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.2);
    vi.stubGlobal('crypto', {});

    try {
      const id = generateSpanId();
      expect(id).toMatch(/^[0-9a-f]{16}$/);
      expect(randomSpy).toHaveBeenCalledTimes(16);
    } finally {
      randomSpy.mockRestore();
      vi.stubGlobal('crypto', originalCrypto);
    }
  });
});

describe('msToNanos', () => {
  it('converts 1ms to nanosecond string', () => {
    expect(msToNanos(1)).toBe('1000000');
  });

  it('floors fractional milliseconds', () => {
    expect(msToNanos(1.9)).toBe('1000000');
  });

  it('handles 0', () => {
    expect(msToNanos(0)).toBe('0');
  });
});

describe('createSpan', () => {
  it('parses path and search from a valid URL', () => {
    const span = createSpan('traceid', 'GET', 'http://example.com/users/1?foo=bar', 'svc');
    expect(span.path).toBe('/users/1?foo=bar');
    expect(span.name).toBe('GET /users/1?foo=bar');
  });

  it('does not throw for an invalid URL, uses raw url as path', () => {
    const span = createSpan('traceid', 'GET', 'not-a-url', 'svc');
    expect(span.path).toBe('not-a-url');
    expect(span.name).toBe('GET not-a-url');
  });

  it('sets startTimeMs close to Date.now()', () => {
    const before = Date.now();
    const span = createSpan('traceid', 'GET', 'http://example.com/', 'svc');
    expect(span.startTimeMs).toBeGreaterThanOrEqual(before);
    expect(span.endTimeMs).toBe(0);
    expect(span.durationMs).toBe(0);
  });

  it('passes parentSpanId through', () => {
    const span = createSpan('tid', 'POST', 'http://example.com/', 'svc', 'parent123');
    expect(span.parentSpanId).toBe('parent123');
  });

  it('serviceName and traceId are set correctly', () => {
    const span = createSpan('my-trace', 'DELETE', 'http://example.com/', 'my-svc');
    expect(span.traceId).toBe('my-trace');
    expect(span.serviceName).toBe('my-svc');
  });
});

describe('spanToOtlpJson', () => {
  const base = {
    traceId: 'tid',
    spanId: 'sid',
    name: 'GET /foo',
    startTimeMs: 1000,
    endTimeMs: 1100,
    durationMs: 100,
    method: 'GET',
    url: 'http://example.com/foo',
    path: '/foo',
    status: 200,
    serviceName: 'svc',
  };
  const baseWithoutStatus = {
    traceId: 'tid',
    spanId: 'sid',
    name: 'GET /foo',
    startTimeMs: 1000,
    endTimeMs: 1100,
    durationMs: 100,
    method: 'GET',
    url: 'http://example.com/foo',
    path: '/foo',
    serviceName: 'svc',
  };

  it('sets STATUS_CODE_ERROR when error is true', () => {
    const json = asOtlpJson(spanToOtlpJson({ ...base, error: true }));
    expect(json.status.code).toBe('STATUS_CODE_ERROR');
  });

  it('sets STATUS_CODE_OK when status is set and no error', () => {
    const json = asOtlpJson(spanToOtlpJson({ ...base, error: false }));
    expect(json.status.code).toBe('STATUS_CODE_OK');
  });

  it('sets STATUS_CODE_UNSET when status and error are absent', () => {
    const json = asOtlpJson(spanToOtlpJson({ ...baseWithoutStatus, error: false }));
    expect(json.status.code).toBe('STATUS_CODE_UNSET');
  });

  it('includes http.status_code attribute only when status is set', () => {
    const withStatus = asOtlpJson(spanToOtlpJson(base));
    const statusAttr = withStatus.attributes.find((a) => a.key === 'http.status_code');
    expect(statusAttr).toBeDefined();
    expect(statusAttr?.value.intValue).toBe(200);

    const withoutStatus = asOtlpJson(spanToOtlpJson(baseWithoutStatus));
    expect(withoutStatus.attributes.find((a) => a.key === 'http.status_code')).toBeUndefined();
  });

  it('includes parentSpanId only when defined', () => {
    const withParent = asOtlpJson(spanToOtlpJson({ ...base, parentSpanId: 'p123' }));
    expect(withParent.parentSpanId).toBe('p123');

    const withoutParent = asOtlpJson(spanToOtlpJson(base));
    expect(withoutParent.parentSpanId).toBeUndefined();
  });

  it('converts times to nanosecond strings', () => {
    const json = asOtlpJson(spanToOtlpJson(base));
    expect(json.startTimeUnixNano).toBe('1000000000');
    expect(json.endTimeUnixNano).toBe('1100000000');
  });
});
