# chaos-proxy

## 1.0.2

### Patch Changes

- 184f5be: Changed
  - changeset config

## 1.0.1

### Patch Changes

- 39501a2: Added
  - package moved to @fetchkit/chaos-proxy

## 1.0.0

### Major Changes

- 4a11b38: Added
  - throttle middleware
  - bodyTransform middleware

  Changed
  - tests moved to /test
  - routing logic improved

## 0.6.0

### Minor Changes

- bd73374: Breaking Changes
  - Migrated core from Express to Koa; all middleware and server logic now use Koa patterns.
  - Refactored middleware API: all built-in and custom middlewares must be Koa async functions.
  - Updated configuration format and options for Koa compatibility.
  - Changed rateLimit middleware options (max → limit).
  - Presets removed.

## 0.5.0

### Minor Changes

- b9880c6: Changed
  - Use Node http/https for transparent proxy streaming

## 0.4.0

### Minor Changes

- a322b27: Fixed
  - Proxy made fully transparent for request/response streaming and headers

## 0.3.1

### Patch Changes

- 6cf9d75: Fixed
  - Executable build

## 0.3.0

### Minor Changes

- fc49ba3: Changed
  - CLI/module load

## 0.2.3

### Patch Changes

- e33f185: Fixed
  - Documented programmatic API exported

## 0.2.2

### Patch Changes

- 4ea5aa8: Fixed
  - npm script fixed

## 0.2.1

### Patch Changes

- e4f56e9: Added
  - prepublishOnly script added to package.json

## 0.2.0

### Minor Changes

- 471042e: Added
  - CORS middleware
  - husky commit hook

## 0.1.0

### Minor Changes

- e32031d: Added
  - Initial release of Chaos Proxy.
