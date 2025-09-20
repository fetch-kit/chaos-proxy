// How to define and use a preset in chaos-proxy
const { registerPreset } = require('../../src/registry/preset');
registerPreset('basicChaos', [
  (req, res, next) => { /* latency */ setTimeout(next, 300); },
  (req, res, next) => { /* log */ console.log('Request:', req.url); next(); }
]);
