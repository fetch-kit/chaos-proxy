import type { Span } from './span';
import { spanToOtlpJson } from './span';

export interface ExporterConfig {
  endpoint: string;
  serviceName: string;
  flushIntervalMs?: number;
  maxBatchSize?: number;
  maxQueueSize?: number;
  headers?: Record<string, string>;
}

export class OtlpExporter {
  private config: Required<ExporterConfig>;
  private spans: Span[] = [];
  private flushTimer?: ReturnType<typeof setTimeout>;
  private isShuttingDown = false;

  constructor(config: ExporterConfig) {
    this.config = {
      flushIntervalMs: config.flushIntervalMs ?? 5000,
      maxBatchSize: config.maxBatchSize ?? 100,
      maxQueueSize: config.maxQueueSize ?? 1000,
      headers: config.headers ?? {},
      ...config,
    };

    this.setupShutdownHooks();
    this.startFlushTimer();
  }

  addSpan(span: Span): void {
    if (this.isShuttingDown) {
      return;
    }

    this.spans.push(span);

    while (this.spans.length > this.config.maxQueueSize) {
      this.spans.shift();
    }

    if (this.spans.length >= this.config.maxBatchSize) {
      this.flush().catch((err) => {
        this.logError('Failed to flush on batch size reached', err);
      });
    }
  }

  async flush(): Promise<void> {
    if (this.spans.length === 0) {
      return;
    }

    const spansToExport = this.spans.splice(0, this.config.maxBatchSize);

    try {
      await this.exportSpans(spansToExport);
    } catch (err) {
      this.logError(`Failed to export ${spansToExport.length} spans`, err);
    }
  }

  private async exportSpans(spansToExport: Span[]): Promise<void> {
    const otlpSpans = spansToExport.map((span) => spanToOtlpJson(span));

    const payload = JSON.stringify({
      resourceSpans: [
        {
          resource: {
            attributes: [
              {
                key: 'service.name',
                value: { stringValue: this.config.serviceName },
              },
            ],
          },
          scopeSpans: [
            {
              scope: {
                name: 'chaos-proxy',
                version: '0.1.0',
              },
              spans: otlpSpans,
            },
          ],
        },
      ],
    });

    const url = new URL('/v1/traces', this.config.endpoint).toString();

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.config.headers,
      },
      body: payload,
    });

    if (!response.ok) {
      throw new Error(`OTLP export failed: ${response.status} ${response.statusText}`);
    }
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    await this.flush();
  }

  private startFlushTimer(): void {
    if (typeof setInterval !== 'undefined') {
      this.flushTimer = setInterval(() => {
        this.flush().catch((err) => {
          this.logError('Failed to flush on timer', err);
        });
      }, this.config.flushIntervalMs);

      if (
        typeof globalThis !== 'undefined' &&
        'unref' in this.flushTimer &&
        typeof (this.flushTimer as NodeJS.Timeout).unref === 'function'
      ) {
        (this.flushTimer as NodeJS.Timeout).unref();
      }
    }
  }

  private setupShutdownHooks(): void {
    if (typeof process !== 'undefined' && process.on) {
      const shutdownHandler = async () => {
        await this.shutdown();
      };

      process.on('SIGTERM', shutdownHandler);
      process.on('SIGINT', shutdownHandler);
    }
  }

  private logError(message: string, error?: unknown): void {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[chaos-proxy telemetry] ${message}${errorMsg ? ': ' + errorMsg : ''}`);
  }
}