import bodyParser from 'koa-bodyparser';
import type { Middleware, Context } from 'koa';

export interface BodyTransformOptions {
  transform: (body: unknown, ctx: Context) => unknown;
}

export function bodyTransform(opts: BodyTransformOptions | string): Middleware {
  let transformFn: (body: unknown, ctx: Context) => unknown;
  if (typeof opts === 'string') {
    try {
      if (opts.trim().startsWith('(')) {
        transformFn = eval(opts);
      } else {
        transformFn = new Function('body', 'ctx', opts) as (body: unknown, ctx: Context) => unknown;
      }
    } catch (e) {
      throw new Error('Failed to evaluate bodyTransform function string: ' + (e as Error).message);
    }
  } else {
    transformFn = opts.transform;
  }

  const parser = bodyParser();
  return async (ctx: Context, next: () => Promise<void>) => {
    await parser(ctx, async () => {
      if (typeof transformFn === 'function' && ctx.request.body !== undefined) {
        ctx.request.body = transformFn(ctx.request.body, ctx);
      }
      await next();
    });
  };
}
