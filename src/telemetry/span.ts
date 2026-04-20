/**
 * OTEL span data model and OTLP serialization.
 */

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTimeMs: number;
  endTimeMs: number;
  durationMs: number;
  method: string;
  url: string;
  path: string;
  status?: number;
  error?: boolean;
  errorMessage?: string;
  serviceName: string;
}

export function generateTraceId(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    const buf = new Uint8Array(16);
    globalThis.crypto.getRandomValues(buf);
    return Array.from(buf)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  return Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

export function generateSpanId(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    const buf = new Uint8Array(8);
    globalThis.crypto.getRandomValues(buf);
    return Array.from(buf)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  return Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

export function msToNanos(ms: number): string {
  return (Math.floor(ms) * 1_000_000).toString();
}

export function spanToOtlpJson(span: Span): Record<string, unknown> {
  const statusCode = span.error
    ? 'STATUS_CODE_ERROR'
    : span.status
      ? 'STATUS_CODE_OK'
      : 'STATUS_CODE_UNSET';

  const otlpSpan: Record<string, unknown> = {
    traceId: span.traceId,
    spanId: span.spanId,
    name: span.name,
    kind: 'SPAN_KIND_SERVER',
    startTimeUnixNano: msToNanos(span.startTimeMs),
    endTimeUnixNano: msToNanos(span.endTimeMs),
    attributes: [
      { key: 'http.method', value: { stringValue: span.method } },
      { key: 'http.url', value: { stringValue: span.url } },
      { key: 'http.target', value: { stringValue: span.path } },
      ...(span.status
        ? [{ key: 'http.status_code', value: { intValue: span.status } }]
        : []),
      { key: 'service.name', value: { stringValue: span.serviceName } },
    ],
    status: {
      code: statusCode,
      message: span.errorMessage || '',
    },
  };

  if (span.parentSpanId) {
    otlpSpan.parentSpanId = span.parentSpanId;
  }

  return otlpSpan;
}

export function createSpan(
  traceId: string,
  method: string,
  url: string,
  serviceName: string,
  parentSpanId?: string
): Span {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname + urlObj.search;
    return {
      traceId,
      spanId: generateSpanId(),
      ...(parentSpanId ? { parentSpanId } : {}),
      name: `${method} ${path}`,
      startTimeMs: Date.now(),
      endTimeMs: 0,
      durationMs: 0,
      method,
      url,
      path,
      serviceName,
    };
  } catch {
    return {
      traceId,
      spanId: generateSpanId(),
      ...(parentSpanId ? { parentSpanId } : {}),
      name: `${method} ${url}`,
      startTimeMs: Date.now(),
      endTimeMs: 0,
      durationMs: 0,
      method,
      url,
      path: url,
      serviceName,
    };
  }
}