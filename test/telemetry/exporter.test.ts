import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OtlpExporter } from '../../src/telemetry/exporter';
import type { Span } from '../../src/telemetry/span';

function makeSpan(overrides: Partial<Span> = {}): Span {
  return {
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
    ...overrides,
  };
}

function makeFetch(ok = true, status = 200) {
  return vi.fn().mockResolvedValue({ ok, status, statusText: ok ? 'OK' : 'Bad Request' });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('OtlpExporter constructor defaults', () => {
  it('applies default values for optional fields', () => {
    const fetchMock = makeFetch();
    vi.stubGlobal('fetch', fetchMock);

    const exporter = new OtlpExporter({ endpoint: 'http://localhost:4318', serviceName: 'svc' });
    // Verify it can be constructed without error
    expect(exporter).toBeDefined();
    exporter.shutdown();
  });
});

describe('OtlpExporter addSpan', () => {
  it('queues spans', async () => {
    vi.stubGlobal('fetch', makeFetch());
    const exporter = new OtlpExporter({ endpoint: 'http://localhost:4318', serviceName: 'svc', maxBatchSize: 10, maxQueueSize: 100 });
    exporter.addSpan(makeSpan());
    await exporter.flush();
    // fetch should have been called once
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    await exporter.shutdown();
  });

  it('drops oldest spans when maxQueueSize is exceeded', async () => {
    vi.stubGlobal('fetch', makeFetch());
    const exporter = new OtlpExporter({ endpoint: 'http://localhost:4318', serviceName: 'svc', maxQueueSize: 2, maxBatchSize: 100 });
    exporter.addSpan(makeSpan({ spanId: 'first' }));
    exporter.addSpan(makeSpan({ spanId: 'second' }));
    exporter.addSpan(makeSpan({ spanId: 'third' }));
    // The oldest ('first') should have been dropped; flush should export 2
    await exporter.flush();
    const firstCall = vi.mocked(fetch).mock.calls[0];
    expect(firstCall).toBeDefined();
    const body = JSON.parse(firstCall![1]!.body as string);
    const spans = body.resourceSpans[0].scopeSpans[0].spans;
    expect(spans.length).toBe(2);
    expect(spans[0].spanId).toBe('second');
    await exporter.shutdown();
  });

  it('auto-flushes when maxBatchSize is reached', async () => {
    vi.stubGlobal('fetch', makeFetch());
    const exporter = new OtlpExporter({ endpoint: 'http://localhost:4318', serviceName: 'svc', maxBatchSize: 2, maxQueueSize: 100 });
    exporter.addSpan(makeSpan());
    exporter.addSpan(makeSpan()); // triggers auto-flush
    await Promise.resolve(); // let flush microtask run
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    await exporter.shutdown();
  });

  it('logs when auto-flush on batch size fails (line 45)', async () => {
    vi.stubGlobal('fetch', makeFetch());
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exporter = new OtlpExporter({ endpoint: 'http://localhost:4318', serviceName: 'svc', maxBatchSize: 1, maxQueueSize: 100 });
    const flushSpy = vi.spyOn(exporter, 'flush').mockRejectedValueOnce(new Error('batch flush boom'));

    exporter.addSpan(makeSpan());
    await Promise.resolve();
    await Promise.resolve();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to flush on batch size reached')
    );
    flushSpy.mockRestore();
    await exporter.shutdown();
  });

  it('does not queue spans when isShuttingDown', async () => {
    vi.stubGlobal('fetch', makeFetch());
    const exporter = new OtlpExporter({ endpoint: 'http://localhost:4318', serviceName: 'svc', maxBatchSize: 100, maxQueueSize: 100 });
    await exporter.shutdown();
    vi.mocked(fetch).mockClear();
    exporter.addSpan(makeSpan());
    await exporter.flush();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});

describe('OtlpExporter flush', () => {
  it('is a no-op when queue is empty', async () => {
    vi.stubGlobal('fetch', makeFetch());
    const exporter = new OtlpExporter({ endpoint: 'http://localhost:4318', serviceName: 'svc' });
    await exporter.flush();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    await exporter.shutdown();
  });

  it('POSTs to /v1/traces with correct JSON shape', async () => {
    vi.stubGlobal('fetch', makeFetch());
    const exporter = new OtlpExporter({ endpoint: 'http://localhost:4318', serviceName: 'my-svc', maxBatchSize: 100, maxQueueSize: 100 });
    exporter.addSpan(makeSpan());
    await exporter.flush();

    const firstCall = vi.mocked(fetch).mock.calls[0];
    expect(firstCall).toBeDefined();
    const [url, init] = firstCall!;
    expect(url).toBe('http://localhost:4318/v1/traces');
    expect(init?.method).toBe('POST');
    const headers = init?.headers as Record<string, string> | undefined;
    expect(headers?.['Content-Type']).toBe('application/json');

    const body = JSON.parse(init?.body as string);
    const rs = body.resourceSpans[0];
    expect(rs.resource.attributes[0].key).toBe('service.name');
    expect(rs.resource.attributes[0].value.stringValue).toBe('my-svc');
    expect(rs.scopeSpans[0].scope.name).toBe('chaos-proxy');
    await exporter.shutdown();
  });

  it('logs error on non-ok HTTP response without throwing', async () => {
    vi.stubGlobal('fetch', makeFetch(false, 500));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exporter = new OtlpExporter({ endpoint: 'http://localhost:4318', serviceName: 'svc', maxBatchSize: 100, maxQueueSize: 100 });
    exporter.addSpan(makeSpan());
    await expect(exporter.flush()).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalled();
    await exporter.shutdown();
  });

  it('logs error on network error without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exporter = new OtlpExporter({ endpoint: 'http://localhost:4318', serviceName: 'svc', maxBatchSize: 100, maxQueueSize: 100 });
    exporter.addSpan(makeSpan());
    await expect(exporter.flush()).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalled();
    await exporter.shutdown();
  });

  it('sends custom headers', async () => {
    vi.stubGlobal('fetch', makeFetch());
    const exporter = new OtlpExporter({
      endpoint: 'http://localhost:4318',
      serviceName: 'svc',
      headers: { 'x-tenant-id': 'test' },
      maxBatchSize: 100,
      maxQueueSize: 100,
    });
    exporter.addSpan(makeSpan());
    await exporter.flush();
    const firstCall = vi.mocked(fetch).mock.calls[0];
    expect(firstCall).toBeDefined();
    const [, init] = firstCall!;
    expect((init?.headers as Record<string, string>)['x-tenant-id']).toBe('test');
    await exporter.shutdown();
  });
});

describe('OtlpExporter shutdown', () => {
  it('flushes remaining spans and prevents further adds', async () => {
    vi.stubGlobal('fetch', makeFetch());
    const exporter = new OtlpExporter({ endpoint: 'http://localhost:4318', serviceName: 'svc', maxBatchSize: 100, maxQueueSize: 100 });
    exporter.addSpan(makeSpan());
    await exporter.shutdown();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });
});

describe('OtlpExporter timer flush', () => {
  it('flushes on interval', async () => {
    vi.stubGlobal('fetch', makeFetch());
    const exporter = new OtlpExporter({ endpoint: 'http://localhost:4318', serviceName: 'svc', flushIntervalMs: 1000, maxBatchSize: 100, maxQueueSize: 100 });
    exporter.addSpan(makeSpan());
    vi.advanceTimersByTime(1000);
    await Promise.resolve();
    await Promise.resolve(); // drain microtasks
    expect(vi.mocked(fetch)).toHaveBeenCalled();
    await exporter.shutdown();
  });

  it('logs when timer-triggered flush fails (line 121)', async () => {
    vi.stubGlobal('fetch', makeFetch());
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exporter = new OtlpExporter({ endpoint: 'http://localhost:4318', serviceName: 'svc', flushIntervalMs: 1000, maxBatchSize: 100, maxQueueSize: 100 });
    const flushSpy = vi.spyOn(exporter, 'flush').mockRejectedValueOnce(new Error('timer flush boom'));

    exporter.addSpan(makeSpan());
    vi.advanceTimersByTime(1000);
    await Promise.resolve();
    await Promise.resolve();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to flush on timer')
    );
    flushSpy.mockRestore();
    await exporter.shutdown();
  });
});

describe('OtlpExporter shutdown hooks', () => {
  it('invokes shutdown handler registered on process signal (lines 138-139)', async () => {
    vi.stubGlobal('fetch', makeFetch());
    const before = process.listeners('SIGTERM').length;
    const exporter = new OtlpExporter({ endpoint: 'http://localhost:4318', serviceName: 'svc' });
    const shutdownSpy = vi.spyOn(exporter, 'shutdown');

    const listeners = process.listeners('SIGTERM');
    const latest = listeners[listeners.length - 1];
    expect(listeners.length).toBeGreaterThan(before);
    expect(latest).toBeDefined();

    await (latest as () => Promise<void>)();
    expect(shutdownSpy).toHaveBeenCalled();
  });
});
