---
'@fetchkit/chaos-proxy': patch
---

Added

- Security and release governance setup (security policy, version/publish automation, and dependency update automation)

Changed

- CI hardening and release pipeline security (pinned actions, modern Node/npm install flow, and provenance-ready publish flow)
- Package metadata cleanup for npm/repository linkage and maintainer info
- Husky prepare script updated for current usage
- Coverage configuration now enforces minimum thresholds

Fixed

- Non-functional release hygiene gaps that could block trusted publishing and long-term maintenance
