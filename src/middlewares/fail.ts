import type { Request, Response, NextFunction } from 'express';

export function fail(opts: { status?: number, body?: string }) {
  return function (req: Request, res: Response, next: NextFunction) {
    res.status(opts.status ?? 503).send(opts.body ?? 'Failed by chaos-proxy');
  };
}
