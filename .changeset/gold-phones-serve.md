---
'@fetchkit/chaos-proxy': patch
---

Added

- property-based fuzz testing for stateful middleware, rate limiting, configuration reloads, routing, middleware composition, proxy streams, throttling, and telemetry

Fixed

- configuration validation now rejects arrays and null for object-valued fields
- throttled stream cancellation and source errors now propagate correctly
- empty successful upstream responses remain empty instead of becoming OK
- telemetry shutdown removes registered process signal listeners
