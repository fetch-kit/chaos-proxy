import { cors } from '../middlewares/cors';
import { registerMiddleware } from './middleware';
// ...existing code...
import { latency } from '../middlewares/latency';
import { latencyRange } from '../middlewares/latencyRange';
import { failRandomly } from '../middlewares/failRandomly';
import { dropConnection } from '../middlewares/dropConnection';
import { fail } from '../middlewares/fail';
import { rateLimit } from '../middlewares/rateLimit';
import type { RateLimitOptions } from '../middlewares/rateLimit';
import { throttle } from '../middlewares/throttle';
import type { ThrottleOptions } from '../middlewares/throttle';

export function registerBuiltins() {
  // Register built-in middleware primitives
  registerMiddleware('latency', (opts) => latency(opts.ms as number));
  registerMiddleware('latencyRange', (opts) =>
    latencyRange(opts.minMs as number, opts.maxMs as number)
  );
  registerMiddleware('failRandomly', (opts) =>
    failRandomly(opts as { rate: number; status?: number; body?: string })
  );
  registerMiddleware('dropConnection', (opts) => dropConnection(opts as { prob?: number }));
  registerMiddleware('fail', (opts) => fail(opts as { status?: number; body?: string }));
  registerMiddleware('cors', (opts) =>
    cors(opts as { origin?: string; methods?: string; headers?: string })
  );
  registerMiddleware('rateLimit', (opts) => rateLimit(opts as unknown as RateLimitOptions));
  registerMiddleware('throttle', (opts) => throttle(opts as unknown as ThrottleOptions));
}
