---
'@fetchkit/chaos-proxy': patch
---

Fixed:

- Response bodies now pass through as raw buffers, preserving upstream formatting and Content-Length.
