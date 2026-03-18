import type { Context, Middleware } from 'koa';
import { createRandom } from './seededRandom';

export function failRandomly(opts: { rate: number; status?: number; body?: string; seed?: number | string }): Middleware {
  const random = createRandom(opts.seed);
  return async (ctx: Context, next: () => Promise<void>) => {
    if (random() < opts.rate) {
      ctx.status = opts.status ?? 503;
      ctx.body = opts.body ?? 'Random failure';
    } else {
      await next();
    }
  };
}