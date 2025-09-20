import type { Request, Response, NextFunction } from 'express';

export function latency(ms: number) {
  return function (req: Request, res: Response, next: NextFunction) {
    setTimeout(next, ms);
  };
}
