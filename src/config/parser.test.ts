import { describe, it, expect } from 'vitest';
import { parseConfig, resolveConfigMiddlewares } from './parser';
import { registerPreset } from '../registry/preset';
import { registerMiddleware } from '../registry/middleware';
import type { RequestHandler } from 'express';
import type { ChaosConfig } from './loader';

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

  it('throws if global is not array', () => {
    expect(() => parseConfig('target: "x"\nglobal: 123')).toThrow(/must be an array/);
  });

  it('throws if routes is not object', () => {
    expect(() => parseConfig('target: "x"\nroutes: 123')).toThrow(/must be a map/);
  });

  it('throws if route value is not array', () => {
    expect(() => parseConfig('target: "x"\nroutes:\n  "/foo": 123')).toThrow(
      /must map to an array/
    );
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

  it('handles preset in global', () => {
    registerPreset('testPreset', [((req, res, next) => next()) as RequestHandler]);
    const result = resolveConfigMiddlewares({
      target: 'x',
      port: 5000,
      global: ['preset:testPreset'],
    } as ChaosConfig);
    expect(result.global.length).toBe(1);
  });

  it('handles preset in routes', () => {
    registerPreset('routePreset', [((req, res, next) => next()) as RequestHandler]);
    const result = resolveConfigMiddlewares({
      target: 'x',
      port: 5000,
      routes: { '/foo': ['preset:routePreset'] },
    } as ChaosConfig);
    expect(Array.isArray(result.routes['/foo'])).toBe(true);
    expect(result.routes['/foo']?.length).toBe(1);
  });

  it('handles valid middleware node in global', () => {
    registerMiddleware('mock', () => ((req, res, next) => next()) as RequestHandler);
    const result = resolveConfigMiddlewares({
      target: 'x',
      port: 5000,
      global: [{ mock: {} }],
    } as ChaosConfig);
    expect(result.global.length).toBe(1);
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
});
