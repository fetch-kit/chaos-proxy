import type { IncomingHttpHeaders } from 'http';
import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  extractTraceContext,
  formatTraceparent,
  injectTraceContext,
  parseTraceparent,
  type TraceContext,
} from '../../src/telemetry/context';
import { OtlpExporter } from '../../src/telemetry/exporter';
import { msToNanos, type Span } from '../../src/telemetry/span';

const hexDigit = fc.constantFrom(...'0123456789abcdef');
const nonZeroHex = (length: number) =>
  fc
    .array(hexDigit, { minLength: length, maxLength: length })
    .map((digits) => digits.join(''))
    .filter((value) => !/^0+$/.test(value));

const traceContextArbitrary: fc.Arbitrary<TraceContext> = fc.record({
  traceId: nonZeroHex(32),
  spanId: nonZeroHex(16),
  traceFlags: fc
    .array(hexDigit, { minLength: 2, maxLength: 2 })
    .map((digits) => digits.join('')),
});

function makeSpan(index: number): Span {
  return {
    traceId: index.toString(16).padStart(32, '0'),
    spanId: index.toString(16).padStart(16, '0'),
    name: `span-${index}`,
    startTimeMs: index,
    endTimeMs: index + 1,
    durationMs: 1,
    method: 'GET',
    url: `http://example.test/${index}`,
    path: `/${index}`,
    status: 200,
    serviceName: 'fuzz',
  };
}

function exportedSpanNames(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.flatMap((call) => {
    const body = JSON.parse(call[1]?.body as string);
    return body.resourceSpans[0].scopeSpans[0].spans.map(
      (span: { name: string }) => span.name,
    );
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('telemetry fuzzing', () => {
  it('round-trips arbitrary valid W3C trace contexts', () => {
    fc.assert(
      fc.property(traceContextArbitrary, (traceContext) => {
        const formatted = formatTraceparent(traceContext);
        expect(parseTraceparent(formatted)).toEqual(traceContext);
        expect(extractTraceContext({ traceparent: formatted })).toEqual(traceContext);
      }),
      { numRuns: 1000 },
    );
  });

  it('rejects generated invalid traceparent variants', () => {
    fc.assert(
      fc.property(traceContextArbitrary, (traceContext) => {
        const valid = formatTraceparent(traceContext);
        const invalid = [
          `01-${traceContext.traceId}-${traceContext.spanId}-${traceContext.traceFlags}`,
          `00-${'0'.repeat(32)}-${traceContext.spanId}-${traceContext.traceFlags}`,
          `00-${traceContext.traceId}-${'0'.repeat(16)}-${traceContext.traceFlags}`,
          valid.slice(1),
          `${valid}x`,
        ];

        for (const candidate of invalid) {
          expect(parseTraceparent(candidate)).toBeNull();
        }
      }),
      { numRuns: 500 },
    );
  });

  it('injects context without changing arbitrary unrelated headers', () => {
    const headerName = fc
      .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz-'), {
        minLength: 1,
        maxLength: 20,
      })
      .map((characters) => characters.join(''))
      .filter((name) => name !== 'traceparent');

    fc.assert(
      fc.property(
        fc.dictionary(headerName, fc.string({ maxLength: 100 })),
        traceContextArbitrary,
        (original, traceContext) => {
          const headers: IncomingHttpHeaders = { ...original };
          injectTraceContext(headers, traceContext);

          expect(headers.traceparent).toBe(formatTraceparent(traceContext));
          for (const [name, value] of Object.entries(original)) {
            expect(headers[name]).toBe(value);
          }
        },
      ),
      { numRuns: 500 },
    );
  });

  it('converts arbitrary millisecond timestamps to exact nanoseconds', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 4_000_000_000, noNaN: true, noDefaultInfinity: true }),
        (milliseconds) => {
          const expected = (BigInt(Math.floor(milliseconds)) * 1_000_000n).toString();
          expect(msToNanos(milliseconds)).toBe(expected);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('removes every signal listener it installs after shutdown', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 8 }), async (exporterCount) => {
        const sigtermBefore = process.listenerCount('SIGTERM');
        const sigintBefore = process.listenerCount('SIGINT');
        const exporters = Array.from(
          { length: exporterCount },
          () =>
            new OtlpExporter({
              endpoint: 'http://localhost:4318',
              serviceName: 'fuzz',
              flushIntervalMs: 60_000,
            }),
        );

        await Promise.all(exporters.map((exporter) => exporter.shutdown()));

        expect(process.listenerCount('SIGTERM')).toBe(sigtermBefore);
        expect(process.listenerCount('SIGINT')).toBe(sigintBefore);
      }),
      { numRuns: 100 },
    );
  });

  it('drops exactly the oldest spans when an arbitrary queue overflows', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 30 }),
        fc.integer({ min: 0, max: 60 }),
        async (maxQueueSize, additionalSpans) => {
          const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
          });
          vi.stubGlobal('fetch', fetchMock);
          const exporter = new OtlpExporter({
            endpoint: 'http://localhost:4318',
            serviceName: 'fuzz',
            maxQueueSize,
            maxBatchSize: maxQueueSize + additionalSpans + 1,
            flushIntervalMs: 60_000,
          });
          const total = maxQueueSize + additionalSpans;
          for (let index = 0; index < total; index++) {
            exporter.addSpan(makeSpan(index));
          }

          await exporter.shutdown();

          expect(exportedSpanNames(fetchMock)).toEqual(
            Array.from(
              { length: Math.min(total, maxQueueSize) },
              (_, offset) => `span-${total - Math.min(total, maxQueueSize) + offset}`,
            ),
          );
        },
      ),
      { numRuns: 300 },
    );
  });

  it('exports arbitrary queues once each in batches no larger than configured', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 0, max: 80 }),
        async (maxBatchSize, spanCount) => {
          const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
          });
          vi.stubGlobal('fetch', fetchMock);
          const exporter = new OtlpExporter({
            endpoint: 'http://localhost:4318',
            serviceName: 'fuzz',
            maxQueueSize: 100,
            maxBatchSize,
            flushIntervalMs: 60_000,
          });
          for (let index = 0; index < spanCount; index++) {
            exporter.addSpan(makeSpan(index));
          }

          await exporter.shutdown();
          await Promise.resolve();

          const batchSizes = fetchMock.mock.calls.map((call) => {
            const body = JSON.parse(call[1]?.body as string);
            return body.resourceSpans[0].scopeSpans[0].spans.length as number;
          });
          expect(batchSizes.every((size) => size <= maxBatchSize)).toBe(true);
          expect(exportedSpanNames(fetchMock)).toEqual(
            Array.from({ length: spanCount }, (_, index) => `span-${index}`),
          );
        },
      ),
      { numRuns: 300 },
    );
  });
});
