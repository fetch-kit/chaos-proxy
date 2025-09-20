import type { Request, Response, NextFunction } from 'express';

export function cors(opts: { origin?: string; methods?: string; headers?: string } = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = typeof opts.origin === 'string' ? opts.origin : '*';
    const methods = typeof opts.methods === 'string' ? opts.methods : 'GET,POST,PUT,DELETE,OPTIONS';
    const headers = typeof opts.headers === 'string' ? opts.headers : 'Content-Type,Authorization';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', methods);
    res.setHeader('Access-Control-Allow-Headers', headers);
    if (req.method === 'OPTIONS') {
      res.status(204).end();
    } else {
      next();
    }
  };
}
