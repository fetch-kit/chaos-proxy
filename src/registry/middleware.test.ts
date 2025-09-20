import { describe, it, expect } from 'vitest';
import { registerMiddleware, resolveMiddleware } from './middleware';
import type { RequestHandler } from 'express';

describe('middleware registry', () => {
  it('registers and resolves a middleware', () => {
    const mockFactory = (opts: any) => {
      return ((req, res, next) => next()) as RequestHandler;
    };
    registerMiddleware('mock', mockFactory);
    const node = { mock: { foo: 'bar' } };
    const mw = resolveMiddleware(node);
    expect(typeof mw).toBe('function');
  });

  it('throws for unknown middleware', () => {
    const node = { notRegistered: {} };
    expect(() => resolveMiddleware(node)).toThrow(/Unknown middleware/);
  });

  it('throws for node with multiple keys', () => {
    const node = { a: {}, b: {} };
    expect(() => resolveMiddleware(node)).toThrow(/exactly one key/);
  });

  it('throws for invalid node type', () => {
    expect(() => resolveMiddleware('not-an-object' as any)).toThrow(/Invalid middleware node/);
  });

  it('passes options to factory', () => {
    let receivedOpts: any = null;
    registerMiddleware('optsTest', (opts) => {
      receivedOpts = opts;
      return ((req, res, next) => next()) as RequestHandler;
    });
    const node = { optsTest: { test: 123 } };
    resolveMiddleware(node);
    expect(receivedOpts).toEqual({ test: 123 });
  });
});
