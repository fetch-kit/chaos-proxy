---
'@fetchkit/chaos-proxy': minor
---

Added:

- Tests for stream-aware body transformation behavior, including the case where response transform is configured but streamed responses remain unchanged

Changed:

- Response handling is now stream-aware per response instead of treating all responses the same
- bodyTransform response transforms now run only for non-stream responses

Fixed:

- bodyTransform no longer mutates streamed responses
