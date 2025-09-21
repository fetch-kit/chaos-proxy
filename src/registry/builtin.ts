import { cors } from '../middlewares/cors';
import { registerMiddleware } from './middleware';
import { registerPreset } from './preset';
import { latency } from '../middlewares/latency';
import { latencyRange } from '../middlewares/latencyRange';
import { failRandomly } from '../middlewares/failRandomly';
import { dropConnection } from '../middlewares/dropConnection';
import { fail } from '../middlewares/fail';

export function registerBuiltins() {
  // Register built-in middleware primitives
  registerMiddleware('latency', (opts) => latency((opts.ms as number)));
  registerMiddleware('latencyRange', (opts) => latencyRange((opts.minMs as number), (opts.maxMs as number)));
  registerMiddleware('failRandomly', (opts) => failRandomly(opts as { rate: number, status?: number, body?: string }));
  registerMiddleware('dropConnection', (opts) => dropConnection(opts as { prob?: number }));
  registerMiddleware('fail', (opts) => fail(opts as { status?: number, body?: string }));
  registerMiddleware('cors', (opts) => cors(opts as { origin?: string; methods?: string; headers?: string }));

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
