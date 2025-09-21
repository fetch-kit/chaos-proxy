import type { Context, Middleware } from 'koa';

export function failNth(opts: { n: number; status?: number; body?: string }): Middleware {
  let count = 0;
  return async (ctx: Context, next: () => Promise<void>) => {
    count++;
    if (count === opts.n) {
      ctx.status = opts.status ?? 500;
      ctx.body = opts.body ?? `Failed on request #${opts.n}`;
      count = 0;
    } else {
      await next();
    }
  };
}