---
'@fetchkit/chaos-proxy': patch
---

Dependencies

- `lru-cache` is now declared as a runtime dependency; the middleware imported it while relying on a transitive copy that only happened to be installed and bundled into `dist`
