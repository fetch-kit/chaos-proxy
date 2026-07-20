import type { IncomingHttpHeaders } from 'http';
import { randomUUID } from 'crypto';

export type VerboseLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const TRACEPARENT_RE = /^(?:[\da-f]{2})-([\da-f]{32})-(?:[\da-f]{16})-(?:[\da-f]{2})$/i;

const SENSITIVE_QUERY_KEYS = new Set([
  'token',
  'secret',
  'password',
  'apikey',
  'api_key',
  'access_token',
  'refresh_token',
]);

function sanitizeControlChars(input: string): string {
  let out = '';
  for (const ch of input) {
    const code = ch.charCodeAt(0);
    if (code <= 31 || code === 127) {
      out += ' ';
      continue;
    }
    out += ch;
  }
  return out;
}

function formatFieldValue(value: unknown): string {
  if (value === undefined || value === null) {
    return 'null';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  const asString = sanitizeControlChars(
    typeof value === 'string' ? value : JSON.stringify(value)
  );
  if (asString.length === 0) {
    return '""';
  }
  if (/\s|=|"/.test(asString)) {
    return JSON.stringify(asString);
  }
  return asString;
}

function sanitizeFieldRecord(
  fields: Record<string, unknown>
): Record<string, string | number | boolean | null> {
  const sanitized: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) {
      continue;
    }
    if (value === null) {
      sanitized[key] = null;
      continue;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      sanitized[key] = value;
      continue;
    }
    sanitized[key] = sanitizeControlChars(
      typeof value === 'string' ? value : JSON.stringify(value)
    );
  }
  return sanitized;
}

export function redactUrlQuery(urlPath: string): string {
  const qIndex = urlPath.indexOf('?');
  if (qIndex === -1) {
    return sanitizeControlChars(urlPath);
  }

  const path = urlPath.slice(0, qIndex);
  const query = urlPath.slice(qIndex + 1);
  const params = new URLSearchParams(query);
  for (const key of params.keys()) {
    if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
      params.set(key, '[REDACTED]');
    }
  }
  const redactedQuery = params.toString();
  return sanitizeControlChars(redactedQuery ? `${path}?${redactedQuery}` : path);
}

export function createRequestId(): string {
  return `rq_${randomUUID().slice(0, 8)}`;
}

export function extractTraceId(headers: IncomingHttpHeaders): string | undefined {
  const value = headers.traceparent;
  const traceparent = Array.isArray(value) ? value[0] : value;
  if (!traceparent) {
    return undefined;
  }
  const match = TRACEPARENT_RE.exec(String(traceparent));
  return match?.[1];
}

export function emitVerbose(
  enabled: boolean | undefined,
  event: string,
  fields: Record<string, unknown>,
  level: VerboseLevel = 'INFO'
): void {
  if (!enabled) {
    return;
  }

  const record = {
    ts: new Date().toISOString(),
    level,
    event,
    ...sanitizeFieldRecord(fields),
  };

  const line = Object.entries(record)
    .map(([key, value]) => `${key}=${formatFieldValue(value)}`)
    .join(' ');

  if (level === 'WARN' || level === 'ERROR') {
    console.error(line);
    return;
  }
  console.log(line);
}
