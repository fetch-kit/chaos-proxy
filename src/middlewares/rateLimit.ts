import rateLimitLib, { ipKeyGenerator } from 'express-rate-limit';
import type { RequestHandler } from 'express';

export function rateLimit(opts: { limit: number, windowMs: number, key?: string | ((req: any) => string), skipIpKeyCheck?: boolean }): RequestHandler {
  let keyGen: (req: any) => string;
  if (typeof opts.key === 'function') {
    keyGen = (req) => {
      const val = (opts.key as (req: any) => string)(req);
      return typeof val === 'string' && val ? val : 'unknown';
    };
  } else if (typeof opts.key === 'string') {
    keyGen = (req) => {
      const headerVal = req.headers[opts.key as string];
      if (typeof headerVal === 'string' && headerVal) return headerVal;
      if (Array.isArray(headerVal) && headerVal.length) return headerVal.join(',');
      return 'unknown';
    };
  } else {
    keyGen = (req) => ipKeyGenerator(req);
  }
  return rateLimitLib({
    windowMs: opts.windowMs,
    max: opts.limit,
    keyGenerator: keyGen,
    handler: (req, res) => {
      res.status(429).send('Rate limit exceeded');
    },
    standardHeaders: true,
    legacyHeaders: false,
    ...(opts.skipIpKeyCheck ? { skipIpKeyCheck: true } : {}),
  });
}
