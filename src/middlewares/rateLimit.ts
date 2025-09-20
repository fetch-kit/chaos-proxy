import rateLimitLib, { ipKeyGenerator } from 'express-rate-limit';
import type { Request, RequestHandler } from 'express';

export function rateLimit(opts: { limit: number, windowMs: number, key?: string | ((req: Request) => string), skipIpKeyCheck?: boolean }): RequestHandler {
  let keyGen: (req: Request) => string;
  if (typeof opts.key === 'function') {
    keyGen = (req: Request) => {
      const val = (opts.key as (req: Request) => string)(req);
      return typeof val === 'string' && val ? val : 'unknown';
    };
  } else if (typeof opts.key === 'string') {
    keyGen = (req: Request) => {
      const headerVal = req.headers[opts.key as string];
      if (typeof headerVal === 'string' && headerVal) return headerVal;
      if (Array.isArray(headerVal) && headerVal.length) return headerVal.join(',');
      return 'unknown';
    };
  } else {
  keyGen = (req: Request) => ipKeyGenerator(req.ip ?? 'unknown');
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
