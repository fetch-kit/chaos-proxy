import ratelimit from 'koa-ratelimit';
import type { Middleware, Context } from 'koa';
import { LRUCache } from 'lru-cache';

// Add this if you get type errors for koa-ratelimit
// declare module 'koa-ratelimit';

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
  key?: string | ((ctx: Context) => string);
}

export function rateLimit(opts: RateLimitOptions): Middleware {
  const db = new LRUCache<string, object>({ max: 10000 });
  let getKey: (ctx: Context) => string;
  if (typeof opts.key === 'function') {
    getKey = opts.key;
  } else if (typeof opts.key === 'string') {
    getKey = (ctx: Context) => {
      return ctx.get(opts.key as string) || ctx.ip || 'unknown';
    };
  } else {
    getKey = (ctx: Context) => ctx.ip || 'unknown';
  }
  return ratelimit({
    driver: 'memory',
    db,
    duration: opts.windowMs,
    errorMessage: 'Rate limit exceeded',
    id: getKey,
    max: opts.limit,
    headers: {
      remaining: 'X-RateLimit-Remaining',
      reset: 'X-RateLimit-Reset',
      total: 'X-RateLimit-Limit',
    },
  });
}