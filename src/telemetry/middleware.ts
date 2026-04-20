import type { Context, Middleware } from 'koa';
import type { ExporterConfig } from './exporter';
import { OtlpExporter } from './exporter';
import { createSpan, generateTraceId } from './span';
import {
  extractTraceContext,
  injectTraceContext,
  setTraceContextInCtx,
  type TraceContext,
} from './context';

export type OtelConfig = ExporterConfig;

const exporterCache = new Map<string, OtlpExporter>();

function getOrCreateExporter(config: ExporterConfig): OtlpExporter {
  const cacheKey = `${config.endpoint}:${config.serviceName}`;

  let exporter = exporterCache.get(cacheKey);
  if (!exporter) {
    exporter = new OtlpExporter(config);
    exporterCache.set(cacheKey, exporter);
  }

  return exporter;
}

function buildRequestUrl(ctx: Context): string {
  const target = typeof ctx.state.proxyTarget === 'string' ? ctx.state.proxyTarget : '';
  try {
    if (target) {
      return new URL(ctx.url, target).toString();
    }
  } catch {
    // Fallback to ctx.url below.
  }

  return ctx.url;
}

export function createTelemetryMiddleware(config: OtelConfig): Middleware {
  const exporter = getOrCreateExporter(config);

  return async (ctx: Context, next: () => Promise<void>) => {
    const startTime = Date.now();

    let traceContext: TraceContext | null = extractTraceContext(ctx.req.headers);
    if (!traceContext) {
      traceContext = {
        traceId: generateTraceId(),
        spanId: '0'.repeat(16),
        traceFlags: '01',
      };
    }

    setTraceContextInCtx(ctx, traceContext);
    injectTraceContext(ctx.req.headers, traceContext);

    const requestUrl = buildRequestUrl(ctx);
    const span = createSpan(traceContext.traceId, ctx.method, requestUrl, config.serviceName);

    try {
      await next();

      if (ctx.status) {
        span.status = ctx.status;
        span.error = ctx.status >= 400;
      }
    } catch (error) {
      span.error = true;
      span.errorMessage = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      span.endTimeMs = Date.now();
      span.durationMs = span.endTimeMs - startTime;
      exporter.addSpan(span);
    }
  };
}

export function telemetryMiddlewareFactory(opts: Record<string, unknown>): Middleware {
  const config = opts as unknown as OtelConfig;

  if (!config.endpoint || !config.serviceName) {
    throw new Error('otel middleware requires "endpoint" and "serviceName" in config');
  }

  return createTelemetryMiddleware(config);
}

export async function shutdownAllTelemetryExporters(): Promise<void> {
  const shutdowns = Array.from(exporterCache.values()).map((exporter) => exporter.shutdown());
  await Promise.allSettled(shutdowns);
  exporterCache.clear();
}
