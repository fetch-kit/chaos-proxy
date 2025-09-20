import { registerMiddleware } from './middleware.ts';
import { registerPreset } from './preset.ts';
import { latency } from '../middlewares/latency.ts';
import { latencyRange } from '../middlewares/latencyRange.ts';
import { failRandomly } from '../middlewares/failRandomly.ts';
import { dropConnection } from '../middlewares/dropConnection.ts';
import { fail } from '../middlewares/fail.ts';

export function registerBuiltins() {
  // Register built-in middleware primitives
  registerMiddleware('latency', (opts) => latency(opts));
  registerMiddleware('latencyRange', (opts) => latencyRange(opts.minMs, opts.maxMs));
  registerMiddleware('failRandomly', (opts) => failRandomly(opts));
  registerMiddleware('dropConnection', (opts) => dropConnection(opts));
  registerMiddleware('fail', (opts) => fail(opts));

  // Register built-in presets
  registerPreset('slowNetwork', [
    latencyRange(300, 1200),
    failRandomly({ rate: 0.05, status: 504 })
  ]);
  registerPreset('flakyApi', [
    failRandomly({ rate: 0.3, status: 503 }),
    dropConnection({ prob: 0.05 })
  ]);
}
