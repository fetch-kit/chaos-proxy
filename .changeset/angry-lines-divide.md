---
'@fetchkit/chaos-proxy': minor
---

Fixed:

- bodyTransform built-in registration regression (config-based bodyTransform now resolves correctly again)
- Proxy transport alignment for transforms:
  - transformed request bodies are forwarded upstream correctly
  - transformed response bodies/headers are applied before sending to client
- Client abort propagation to upstream proxy request/response streams
- Throttle burst state correctness: per-client burst budget is now persisted/refilled across sequential responses.

Changed:

- Upstream proxying now uses keep-alive HTTP/HTTPS agents
- Built-in registry test coverage was expanded to cover all currently registered built-ins.
- README clarified that enabling bodyTransform implies body buffering as an explicit tradeoff

Removed:

- Express-related dependencies
