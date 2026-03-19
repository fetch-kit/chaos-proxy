// Example of a custom middleware factory for chaos-proxy.
//
// Usage:
//   import { registerMiddleware, startServer } from 'chaos-proxy';
//   import './customMiddleware.js'; // registers 'customLogger'
//
// Then in config:
//   global:
//     - customLogger:
//         prefix: "[myapp]"
import { registerMiddleware } from 'chaos-proxy';

registerMiddleware('customLogger', (opts) => {
  const prefix = opts.prefix ?? '[chaos]';
  return async (ctx, next) => {
    console.log(`${prefix} ${ctx.method} ${ctx.url}`);
    await next();
  };
});
