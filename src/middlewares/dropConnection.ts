import type { Request, Response, NextFunction } from 'express';

export function dropConnection(opts: { prob?: number }) {
  return function (req: Request, res: Response, next: NextFunction) {
    if (Math.random() < (opts.prob ?? 1)) {
      // Destroy the socket to simulate a dropped connection
      if (res.socket) {
        res.socket.destroy();
      } else {
        res.end();
      }
    } else {
      next();
    }
  };
}
