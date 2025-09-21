import type { Context, Middleware } from 'koa';

export function failRandomly(opts: { rate: number; status?: number; body?: string }): Middleware {
  return async (ctx: Context, next: () => Promise<void>) => {
    if (Math.random() < opts.rate) {
      ctx.status = opts.status ?? 503;
      ctx.body = opts.body ?? 'Random failure';
    } else {
      await next();
    }
  };
}