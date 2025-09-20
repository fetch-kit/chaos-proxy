// Example of a custom middleware for chaos-proxy
const { registerMiddleware } = require('../../src/registry/middleware');

// Define your custom middleware
function customLogger(req, res, next) {
  console.log('Custom middleware:', req.method, req.url);
  next();
}

// Register the middleware with chaos-proxy
registerMiddleware('customLogger', () => customLogger);

// Usage in config.yaml:
// global:
//   - customLogger: {}
