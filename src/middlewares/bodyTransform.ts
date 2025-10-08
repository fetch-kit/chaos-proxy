import bodyParser from 'koa-bodyparser';
import type { Middleware, Context } from 'koa';

export interface BodyTransformOptions {
  request?: { transform: (body: unknown, ctx: Context) => unknown } | string;
  response?: { transform: (body: unknown, ctx: Context) => unknown } | string;
}

function isTransformObject(opt: unknown): opt is { transform: (body: unknown, ctx: Context) => unknown } {
  return (
    typeof opt === 'object' &&
    opt !== null &&
    'transform' in opt &&
    typeof (opt as { transform: unknown }).transform === 'function'
  );
}

function parseTransform(opt: { transform: (body: unknown, ctx: Context) => unknown } | string | undefined, which: string): ((body: unknown, ctx: Context) => unknown) | undefined {
  if (!opt) return undefined;
  if (typeof opt === 'string') {
    try {
      if (opt.trim().startsWith('(')) {
        // Function string, e.g. (body, ctx) => ...
        return eval(opt);
      } else {
        // Function body string, e.g. 'return {...body, foo: "bar"}'
        return new Function('body', 'ctx', opt) as (body: unknown, ctx: Context) => unknown;
      }
    } catch (e) {
      throw new Error(`Failed to evaluate bodyTransform ${which} function string: ${(e as Error).message}`);
    }
  } else if (isTransformObject(opt)) {
    return opt.transform;
  } else {
    throw new Error(`Invalid bodyTransform ${which} option: must be a function or string`);
  }
}

export function bodyTransform(opts: BodyTransformOptions): Middleware {
  if (typeof opts !== 'object' || (!opts.request && !opts.response)) {
    throw new Error('bodyTransform expects an object with request and/or response keys');
  }

  const requestTransform = parseTransform(opts.request, 'request');
  const responseTransform = parseTransform(opts.response, 'response');
  const parser = bodyParser();

  return async (ctx: Context, next: () => Promise<void>) => {
    // Transform request body if needed
    if (requestTransform) {
      await parser(ctx, async () => {
        if (ctx.request.body !== undefined) {
          ctx.request.body = requestTransform(ctx.request.body, ctx);
        }
        await next();
      });
    } else {
      await next();
    }
    // Transform response body if needed
    if (responseTransform && ctx.body !== undefined) {
      ctx.body = responseTransform(ctx.body, ctx);
    }
  };
}
