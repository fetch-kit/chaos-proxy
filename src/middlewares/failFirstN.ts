import type { Context, Middleware } from 'koa';

export function failFirstN(opts: { n: number; status?: number; body?: string }): Middleware {
  let count = 0;
  return async (ctx: Context, next: () => Promise<void>) => {
    if (count < opts.n) {
      count++;
      ctx.status = opts.status ?? 503;
      ctx.body = opts.body ?? 'Failed by chaos-proxy';
      // next is intentionally not called
    } else {
      await next();
    }
  };
}
