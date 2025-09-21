import type { Context, Middleware } from 'koa';

export function cors(opts: { origin?: string; methods?: string; headers?: string } = {}): Middleware {
  return async (ctx: Context, next: () => Promise<void>) => {
    const origin = typeof opts.origin === 'string' ? opts.origin : '*';
    const methods = typeof opts.methods === 'string' ? opts.methods : 'GET,POST,PUT,DELETE,OPTIONS';
    const headers = typeof opts.headers === 'string' ? opts.headers : 'Content-Type,Authorization';
    ctx.set('Access-Control-Allow-Origin', origin);
    ctx.set('Access-Control-Allow-Methods', methods);
    ctx.set('Access-Control-Allow-Headers', headers);
    if (ctx.method === 'OPTIONS') {
      ctx.status = 204;
    } else {
      await next();
    }
  };
}