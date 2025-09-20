import type { Request, Response, NextFunction } from 'express';

export function failRandomly(opts: { rate: number, status?: number, body?: string }) {
  return function (req: Request, res: Response, next: NextFunction) {
    if (Math.random() < opts.rate) {
      res.status(opts.status ?? 503).send(opts.body ?? 'Random failure');
    } else {
      next();
    }
  };
}
