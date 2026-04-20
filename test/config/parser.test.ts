import { describe, it, expect, vi } from 'vitest';
import { parseConfig, resolveConfigMiddlewares } from '../../src/config/parser';
// ...existing code...
// ...existing code...
// ...existing code...
import type { ChaosConfig } from '../../src/config/loader';
import * as middlewareRegistry from '../../src/registry/middleware';

describe('parseConfig', () => {
  it('parses a valid config with default port', () => {
    const cfg = parseConfig('target: "http://localhost:4000"');
    expect(cfg.target).toBe('http://localhost:4000');
    expect(cfg.port).toBe(5000);
  });

  it('parses a valid config with custom port', () => {
    const cfg = parseConfig('target: "http://localhost:4000"\nport: 1234');
    expect(cfg.port).toBe(1234);
  });

  it('throws if target is missing', () => {
    expect(() => parseConfig('port: 5000')).toThrow(/must include a string/);
  });

  it('throws if parsed root is not an object (lines 10-11)', () => {
    expect(() => parseConfig('123')).toThrow(/YAML object/);
  });

  it('throws if global is not array', () => {
    expect(() => parseConfig('target: "x"\nglobal: 123')).toThrow(/must be an array/);
  });

  it('throws if otel is not object (lines 20-21)', () => {
    expect(() => parseConfig('target: "x"\notel: 123')).toThrow(/otel" must be an object/);
  });

  it('throws if routes is not object', () => {
    expect(() => parseConfig('target: "x"\nroutes: 123')).toThrow(/must be a map/);
  });

  it('throws if route value is not array', () => {
    expect(() => parseConfig('target: "x"\nroutes:\n  "/foo": 123')).toThrow(
      /must map to an array/
    );
  });

  it('wraps YAML parse errors (lines 42-43)', () => {
    expect(() => parseConfig('target: [')).toThrow(/YAML parse error/);
  });
});

describe('resolveConfigMiddlewares', () => {
  it('handles empty config', () => {
    const result = resolveConfigMiddlewares({ target: 'x', port: 5000 } as ChaosConfig);
    expect(result.global).toEqual([]);
    expect(result.routes).toEqual({});
  });

  it('handles config with no routes', () => {
    const result = resolveConfigMiddlewares({ target: 'x', port: 5000, global: [] } as ChaosConfig);
    expect(result.global).toEqual([]);
    expect(result.routes).toEqual({});
  });

  it('throws for invalid middleware node', () => {
    expect(() =>
      resolveConfigMiddlewares({ target: 'x', port: 5000, global: [123] } as ChaosConfig)
    ).toThrow();
  });

  it('throws for multiple keys in middleware node', () => {
    expect(() =>
      resolveConfigMiddlewares({
        target: 'x',
        port: 5000,
        global: [{ a: {}, b: {} }],
      } as ChaosConfig)
    ).toThrow();
  });

  it('throws for unknown middleware', () => {
    expect(() =>
      resolveConfigMiddlewares({
        target: 'x',
        port: 5000,
        global: [{ notRegistered: {} }],
      } as ChaosConfig)
    ).toThrow();
  });

  it('resolves otel node and route nodes (lines 55, 70-71)', () => {
    const resolverSpy = vi
      .spyOn(middlewareRegistry, 'resolveMiddleware')
      .mockReturnValue((async () => {}) as unknown as ReturnType<typeof middlewareRegistry.resolveMiddleware>);

    const config = {
      target: 'x',
      port: 5000,
      otel: { endpoint: 'http://localhost:4318', serviceName: 'svc' },
      global: [{ fail: { status: 500 } }],
      routes: {
        'GET /foo': [{ latency: { ms: 10 } }],
      },
    } as unknown as ChaosConfig;

    const result = resolveConfigMiddlewares(config);

    expect(result.global).toHaveLength(2);
    expect(result.routes['GET /foo']).toHaveLength(1);
    expect(resolverSpy).toHaveBeenCalledTimes(3);
    expect(resolverSpy).toHaveBeenNthCalledWith(1, { otel: config.otel as Record<string, unknown> });
    expect(resolverSpy).toHaveBeenNthCalledWith(3, { latency: { ms: 10 } });

    resolverSpy.mockRestore();
  });
});
