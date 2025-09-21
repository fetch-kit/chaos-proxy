import type { Context, Middleware } from 'koa';

export function fail(opts: { status?: number, body?: string }): Middleware {
  return async (ctx: Context) => {
    ctx.status = opts.status ?? 503;
    ctx.body = opts.body ?? 'Failed by chaos-proxy';
    // next is intentionally not called
  };
}