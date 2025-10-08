import type { Context } from 'koa';

export type HeaderTransformFn = (headers: Record<string, string | string[] | undefined>, ctx: Context) => Record<string, string | string[] | undefined>;

export interface HeaderTransformConfig {
  request?: string | { transform: HeaderTransformFn };
  response?: string | { transform: HeaderTransformFn };
}

function parseTransform(fnOrString: string | { transform: HeaderTransformFn } | undefined): HeaderTransformFn | undefined {
  if (!fnOrString) return undefined;
  if (typeof fnOrString === 'string') {
    // Try to parse as arrow function or function body
    try {
      if (fnOrString.trim().startsWith('(') || fnOrString.includes('=>')) {
        return eval(fnOrString);
      } else {
        return new Function('headers', 'ctx', fnOrString) as HeaderTransformFn;
      }
    } catch (e) {
      throw new Error('Invalid headerTransform function string: ' + e);
    }
  }
  if (typeof fnOrString === 'object' && typeof fnOrString.transform === 'function') {
    return fnOrString.transform;
  }
  throw new Error('Invalid headerTransform config');
}

export function headerTransform(config: HeaderTransformConfig) {
  const requestTransform = parseTransform(config.request);
  const responseTransform = parseTransform(config.response);

  return async function headerTransformMiddleware(ctx: Context, next: () => Promise<void>) {
    // Request headers
    if (requestTransform) {
      // Only pass string or string[] values to the transform
      const reqHeaders: Record<string, string | string[] | undefined> = {};
      for (const [k, v] of Object.entries(ctx.request.headers)) {
        if (typeof v === 'string' || Array.isArray(v)) {
          reqHeaders[k] = v;
        } else if (typeof v === 'number') {
          reqHeaders[k] = String(v);
        } else if (v != null) {
          reqHeaders[k] = String(v);
        }
      }
      const newHeaders = requestTransform(reqHeaders, ctx);
      ctx.request.headers = { ...newHeaders };
    }
    await next();
    // Response headers
    if (responseTransform) {
      // Only pass string or string[] values to the transform
      const resHeaders: Record<string, string | string[] | undefined> = {};
      for (const [k, v] of Object.entries(ctx.response.headers)) {
        if (typeof v === 'string' || Array.isArray(v)) {
          resHeaders[k] = v;
        } else if (typeof v === 'number') {
          resHeaders[k] = String(v);
        } else if (v != null) {
          resHeaders[k] = String(v);
        }
      }
      const newHeaders = responseTransform(resHeaders, ctx);
      ctx.response.headers = { ...newHeaders };
    }
  };
}
