import type { RequestHandler } from 'express';

const middlewareRegistry: Record<string, (opts: Record<string, unknown>) => RequestHandler> = {};

export function registerMiddleware(name: string, factory: (opts: Record<string, unknown>) => RequestHandler) {
  middlewareRegistry[name] = factory;
}

export function resolveMiddleware(node: Record<string, unknown>): RequestHandler {
  if (typeof node === 'object' && node !== null) {
    const keys = Object.keys(node);
    if (keys.length !== 1) throw new Error('Middleware node must have exactly one key');
    const name = keys[0] as keyof typeof middlewareRegistry;
  const opts = node[name as keyof typeof node] as Record<string, unknown>;
    const factory = middlewareRegistry[name];
    if (!factory) throw new Error(`Unknown middleware: ${String(name)}`);
    return factory(opts);
  }
  throw new Error('Invalid middleware node');
}
