import type { Context, Middleware } from 'koa';

export function latency(ms: number): Middleware {
  return async (ctx: Context, next: () => Promise<void>) => {
    await new Promise(resolve => setTimeout(resolve, ms));
    await next();
  };
}