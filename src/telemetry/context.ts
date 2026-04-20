import type { IncomingHttpHeaders } from 'http';
import type { Context } from 'koa';

export interface TraceContext {
  traceId: string;
  spanId: string;
  traceFlags: string;
}

const TRACEPARENT = 'traceparent';

function getHeaderValue(
  headers: IncomingHttpHeaders,
  name: string
): string | undefined {
  const value = headers[name];
  if (Array.isArray(value)) {
    return value[0];
  }
  return typeof value === 'string' ? value : undefined;
}

function isAllZeroHex(hex: string): boolean {
  return /^0+$/.test(hex);
}

export function parseTraceparent(headerValue: string): TraceContext | null {
  const match = headerValue.match(/^([\da-f]{2})-([\da-f]{32})-([\da-f]{16})-([\da-f]{2})$/i);
  if (!match) {
    return null;
  }

  const version = match[1];
  const traceId = match[2];
  const spanId = match[3];
  const traceFlags = match[4];
  if (!version || !traceId || !spanId || !traceFlags) {
    return null;
  }
  if (version !== '00') {
    return null;
  }
  if (isAllZeroHex(traceId) || isAllZeroHex(spanId)) {
    return null;
  }

  return {
    traceId,
    spanId,
    traceFlags,
  };
}

export function formatTraceparent(traceContext: TraceContext): string {
  return `00-${traceContext.traceId}-${traceContext.spanId}-${traceContext.traceFlags}`;
}

export function extractTraceContext(headers: IncomingHttpHeaders): TraceContext | null {
  const traceparent = getHeaderValue(headers, TRACEPARENT);
  if (!traceparent) {
    return null;
  }

  return parseTraceparent(traceparent);
}

export function injectTraceContext(
  headers: IncomingHttpHeaders,
  traceContext: TraceContext
): void {
  headers[TRACEPARENT] = formatTraceparent(traceContext);
}

export function setTraceContextInCtx(ctx: Context, traceContext: TraceContext): void {
  ctx.state.traceContext = traceContext;
}
