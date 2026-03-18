import type { Context, Middleware } from 'koa';
import { createRandom } from './seededRandom';

export function latencyRange(minMs: number, maxMs: number, seed?: number | string): Middleware {
  const random = createRandom(seed);
  return async (ctx: Context, next: () => Promise<void>) => {
    const delay = Math.floor(random() * (maxMs - minMs + 1)) + minMs;
    await new Promise(resolve => setTimeout(resolve, delay));
    await next();
  };
}