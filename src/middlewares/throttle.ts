import { Transform } from 'stream';
import type { Middleware, Context } from 'koa';
import { LRUCache } from 'lru-cache';

export interface ThrottleOptions {
  rate: number; // bytes per second
  chunkSize?: number; // bytes per chunk
  burst?: number; // initial burst in bytes
  key?: string | ((ctx: Context) => string);
}

class ThrottleStream extends Transform {
  private rate: number;
  private chunkSize: number;
  private burst: number;
  private sent: number = 0;
  private start: number = Date.now();
  private burstLeft: number;

  constructor(opts: ThrottleOptions) {
    super();
    this.rate = opts.rate;
    this.chunkSize = opts.chunkSize || 16384;
    this.burst = opts.burst || 0;
    this.burstLeft = this.burst;
  }

  _transform(chunk: Buffer, encoding: BufferEncoding, callback: (err?: Error | null) => void) {
    let offset = 0;
    const sendChunk = () => {
      if (offset >= chunk.length) return callback();
      let toSend = Math.min(this.chunkSize, chunk.length - offset);
      // Handle burst
      if (this.burstLeft > 0) {
        const burstSend = Math.min(this.burstLeft, toSend);
        this.push(chunk.slice(offset, offset + burstSend));
        offset += burstSend;
        this.burstLeft -= burstSend;
        if (burstSend < toSend) {
          toSend -= burstSend;
        } else {
          setImmediate(sendChunk);
          return;
        }
      }
      // Throttle
      if (toSend > 0) {
        this.push(chunk.slice(offset, offset + toSend));
        offset += toSend;
        this.sent += toSend;
        const elapsed = (Date.now() - this.start) / 1000;
        const expected = this.sent / this.rate;
        const delay = Math.max(0, (expected - elapsed) * 1000);
        setTimeout(sendChunk, delay);
      }
    };
    sendChunk();
  }
}

export function throttle(opts: ThrottleOptions): Middleware {
  const db = new LRUCache<string, { burstLeft: number }>({ max: 10000 });
  let getKey: (ctx: Context) => string;
  if (typeof opts.key === 'function') {
    getKey = opts.key;
  } else if (typeof opts.key === 'string') {
    getKey = (ctx: Context) => ctx.get(opts.key as string) || ctx.ip || 'unknown';
  } else {
    getKey = (ctx: Context) => ctx.ip || 'unknown';
  }
  return async (ctx, next) => {
    await next();
    if (!ctx.body || typeof ctx.body.pipe !== 'function') return;
    const key = getKey(ctx);
    let burstLeft = opts.burst || 0;
    if (opts.burst) {
      const entry = db.get(key);
      burstLeft = entry?.burstLeft ?? opts.burst;
      db.set(key, { burstLeft: Math.max(0, burstLeft) });
    }
    const throttler = new ThrottleStream({ ...opts, burst: burstLeft });
    ctx.body = ctx.body.pipe(throttler);
  };
}
