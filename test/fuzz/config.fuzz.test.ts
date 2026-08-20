import fc from 'fast-check';
import type { Middleware } from 'koa';
import yaml from 'yaml';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  parseConfig,
  resolveConfigMiddlewares,
  validateConfigObject,
} from '../../src/config/parser';
import type { ChaosConfig } from '../../src/config/loader';
import * as middlewareRegistry from '../../src/registry/middleware';

const targetArbitrary = fc
  .tuple(
    fc.constantFrom('http', 'https'),
    fc.stringMatching(/^[a-z][a-z0-9-]{0,20}$/),
    fc.integer({ min: 1, max: 65_535 }),
  )
  .map(([scheme, host, port]) => `${scheme}://${host}.example.test:${port}`);

const middlewareNameArbitrary = fc.stringMatching(/^[a-z][a-z0-9]{0,15}$/);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('configuration fuzzing', () => {
  it('parses arbitrary generated valid YAML consistently with object validation', () => {
    fc.assert(
      fc.property(
        targetArbitrary,
        fc.option(fc.integer({ min: 1, max: 65_535 }), { nil: undefined }),
        (target, port) => {
          const input = { target, ...(port === undefined ? {} : { port }), global: [], routes: {} };

          expect(parseConfig(yaml.stringify(input))).toEqual({
            ...input,
            port: port ?? 5_000,
          });
          expect(validateConfigObject(structuredClone(input))).toEqual({
            ...input,
            port: port ?? 5_000,
          });
        },
      ),
      { numRuns: 500 },
    );
  });

  it('preserves arbitrary explicit valid ports', () => {
    fc.assert(
      fc.property(targetArbitrary, fc.integer({ min: 1, max: 65_535 }), (target, port) => {
        expect(validateConfigObject({ target, port }).port).toBe(port);
      }),
      { numRuns: 500 },
    );
  });

  it('rejects arbitrary invalid optional collection shapes', () => {
    const invalidGlobal = fc.oneof(fc.constant(null), fc.integer(), fc.string(), fc.object());
    const invalidObject = fc.oneof(
      fc.constant(null),
      fc.integer(),
      fc.string(),
      fc.array(fc.anything()),
    );
    const invalidField = fc.oneof(
      invalidGlobal.map((value) => ({ global: value })),
      invalidObject.map((value) => ({ otel: value })),
      invalidObject.map((value) => ({ routes: value })),
    );

    fc.assert(
      fc.property(targetArbitrary, invalidField, (target, field) => {
        expect(() => validateConfigObject({ target, ...field })).toThrow();
      }),
      { numRuns: 500 },
    );
  });

  it('rejects arbitrary non-array route middleware values', () => {
    fc.assert(
      fc.property(
        targetArbitrary,
        middlewareNameArbitrary,
        fc.oneof(fc.constant(null), fc.integer(), fc.string(), fc.object()),
        (target, route, value) => {
          expect(() => validateConfigObject({ target, routes: { [`/${route}`]: value } })).toThrow(
            /must map to an array/,
          );
        },
      ),
      { numRuns: 500 },
    );
  });

  it('preserves arbitrary generated global and route middleware order', () => {
    fc.assert(
      fc.property(
        fc.array(middlewareNameArbitrary, { maxLength: 30 }),
        fc.array(middlewareNameArbitrary, { maxLength: 30 }),
        (globalNames, routeNames) => {
          const resolvedNames: string[] = [];
          vi.spyOn(middlewareRegistry, 'resolveMiddleware').mockImplementation((node) => {
            resolvedNames.push(Object.keys(node)[0] ?? '');
            return (async (_ctx, next) => next()) as Middleware;
          });
          const config = {
            target: 'https://example.test',
            global: globalNames.map((name) => ({ [name]: {} })),
            routes: {
              'GET /resource': routeNames.map((name) => ({ [name]: {} })),
            },
          } as ChaosConfig;

          const resolved = resolveConfigMiddlewares(config);

          expect(resolved.global).toHaveLength(globalNames.length);
          expect(resolved.routes['GET /resource']).toHaveLength(routeNames.length);
          expect(resolvedNames).toEqual([...globalNames, ...routeNames]);
          vi.restoreAllMocks();
        },
      ),
      { numRuns: 500 },
    );
  });
});
