import { describe, it, expect } from 'vitest';
import { registerMiddleware, resolveMiddleware } from './middleware';
import type { RequestHandler } from 'express';

describe('middleware registry', () => {
  it('registers and resolves a middleware', () => {
  const mockFactory = () => {
      return ((req, res, next) => next()) as RequestHandler;
    };
    registerMiddleware('mock', mockFactory);
    const node: Record<string, unknown> = { mock: { foo: 'bar' } };
    const mw = resolveMiddleware(node);
    expect(typeof mw).toBe('function');
  });

  it('throws for unknown middleware', () => {
    const node: Record<string, unknown> = { notRegistered: {} };
    expect(() => resolveMiddleware(node)).toThrow(/Unknown middleware/);
  });

  it('throws for node with multiple keys', () => {
    const node: Record<string, unknown> = { a: {}, b: {} };
    expect(() => resolveMiddleware(node)).toThrow(/exactly one key/);
  });

  it('throws for invalid node type', () => {
    // Pass a value that is an object but not a valid middleware node
    expect(() => resolveMiddleware({})).toThrow(/exactly one key/);
  });

  it('passes options to factory', () => {
    let receivedOpts: Record<string, unknown> | null = null;
    registerMiddleware('optsTest', (_opts: Record<string, unknown>) => {
      receivedOpts = _opts;
      return ((req, res, next) => next()) as RequestHandler;
    });
    const node: Record<string, unknown> = { optsTest: { test: 123 } };
    resolveMiddleware(node);
    expect(receivedOpts).toEqual({ test: 123 });
  });
});
