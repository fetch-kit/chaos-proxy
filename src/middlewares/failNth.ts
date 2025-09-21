import type { Request, Response, NextFunction } from 'express';

export function failNth(opts: { n: number; status?: number; body?: string }) {
  let count = 0;
  return function (req: Request, res: Response, next: NextFunction) {
    count++;
    if (count === opts.n) {
      res.status(opts.status ?? 500).send(opts.body ?? `Failed on request #${opts.n}`);
      count = 0;
    } else {
      next();
    }
  };
}
