import type { Context, Middleware } from 'koa';
import { createRandom } from './seededRandom';

export function dropConnection(opts: { prob?: number; seed?: number | string }): Middleware {
  const random = createRandom(opts.seed);
  return async (ctx: Context, next: () => Promise<void>) => {
    if (random() < (opts.prob ?? 1)) {
      if (ctx.res.socket) {
        ctx.res.socket.destroy();
      } else {
        ctx.res.end();
      }
    } else {
      await next();
    }
  };
}