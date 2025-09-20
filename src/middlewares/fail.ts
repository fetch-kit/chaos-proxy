import type { Request, Response } from 'express';

export function fail(opts: { status?: number, body?: string }) {
  return function (req: Request, res: Response, _next: () => void) { /* eslint-disable-line @typescript-eslint/no-unused-vars */
    res.status(opts.status ?? 503).send(opts.body ?? 'Failed by chaos-proxy');
    // next is intentionally not called
  };
}
