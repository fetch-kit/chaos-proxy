import type { RequestHandler } from 'express';

const middlewareRegistry: Record<string, (opts: any) => RequestHandler> = {};

export function registerMiddleware(name: string, factory: (opts: any) => RequestHandler) {
  middlewareRegistry[name] = factory;
}

export function resolveMiddleware(node: any): RequestHandler {
  if (typeof node === 'object' && node !== null) {
    const keys = Object.keys(node);
    if (keys.length !== 1) throw new Error('Middleware node must have exactly one key');
    const name = keys[0] as keyof typeof middlewareRegistry;
    const opts = node[name as keyof typeof node];
    const factory = middlewareRegistry[name];
    if (!factory) throw new Error(`Unknown middleware: ${String(name)}`);
    return factory(opts);
  }
  throw new Error('Invalid middleware node');
}
