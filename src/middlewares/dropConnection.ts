import type { Context, Middleware } from 'koa';

export function dropConnection(opts: { prob?: number }): Middleware {
  return async (ctx: Context, next: () => Promise<void>) => {
    if (Math.random() < (opts.prob ?? 1)) {
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