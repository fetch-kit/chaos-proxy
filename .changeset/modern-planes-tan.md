---
'chaos-proxy': minor
---

Breaking Changes

- Migrated core from Express to Koa; all middleware and server logic now use Koa patterns.
- Refactored middleware API: all built-in and custom middlewares must be Koa async functions.
- Updated configuration format and options for Koa compatibility.
- Changed rateLimit middleware options (max → limit).
