import type { Request, Response, NextFunction } from 'express';

export function latencyRange(minMs: number, maxMs: number) {
  return function (req: Request, res: Response, next: NextFunction) {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    setTimeout(next, delay);
  };
}
