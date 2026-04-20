import { registerMiddleware } from './middleware';
import { bodyTransform } from '../middlewares/bodyTransform';
import type { BodyTransformOptions } from '../middlewares/bodyTransform';
import { cors } from '../middlewares/cors';
import { dropConnection } from '../middlewares/dropConnection';
import { headerTransform } from '../middlewares/headerTransform';
import { fail } from '../middlewares/fail';
import { failNth } from '../middlewares/failNth';
import { failRandomly } from '../middlewares/failRandomly';
import { latency } from '../middlewares/latency';
import { latencyRange } from '../middlewares/latencyRange';
import { rateLimit } from '../middlewares/rateLimit';
import type { RateLimitOptions } from '../middlewares/rateLimit';
import { throttle } from '../middlewares/throttle';
import type { ThrottleOptions } from '../middlewares/throttle';
import { telemetryMiddlewareFactory } from '../telemetry/middleware';

export function registerBuiltins() {
  // Register built-in middleware primitives
  registerMiddleware('latency', (opts) => latency(opts as unknown as number));
  registerMiddleware('latencyRange', (opts) =>
    latencyRange(opts.minMs as number, opts.maxMs as number, opts.seed as number | string | undefined)
  );
  registerMiddleware('failRandomly', (opts) =>
    failRandomly(opts as { rate: number; status?: number; body?: string; seed?: number | string })
  );
  registerMiddleware('dropConnection', (opts) =>
    dropConnection(opts as { prob?: number; seed?: number | string })
  );
  registerMiddleware('fail', (opts) => fail(opts as { status?: number; body?: string }));
  registerMiddleware('failNth', (opts) =>
    failNth(opts as { n: number; status?: number; body?: string })
  );
  registerMiddleware('cors', (opts) =>
    cors(opts as { origin?: string; methods?: string; headers?: string })
  );
  registerMiddleware('rateLimit', (opts) => rateLimit(opts as unknown as RateLimitOptions));
  registerMiddleware('throttle', (opts) => throttle(opts as unknown as ThrottleOptions));
  registerMiddleware('bodyTransform', (opts) => bodyTransform(opts as unknown as BodyTransformOptions));
  registerMiddleware('headerTransform', (opts) => headerTransform(opts));
  registerMiddleware('otel', (opts) => telemetryMiddlewareFactory(opts));
}
