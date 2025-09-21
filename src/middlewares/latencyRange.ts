import type { Context, Middleware } from 'koa';

export function latencyRange(minMs: number, maxMs: number): Middleware {
  return async (ctx: Context, next: () => Promise<void>) => {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    await new Promise(resolve => setTimeout(resolve, delay));
    await next();
  };
}