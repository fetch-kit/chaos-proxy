[![npm](https://img.shields.io/npm/v/chaos-proxy)](https://www.npmjs.com/package/chaos-proxy)
[![Downloads](https://img.shields.io/npm/dm/chaos-proxy)](https://www.npmjs.com/package/chaos-proxy)
[![GitHub stars](https://img.shields.io/github/stars/gkoos/chaos-proxy?style=social)](https://github.com/gkoos/chaos-proxy)
[![Build](https://github.com/gkoos/chaos-proxy/actions/workflows/ci.yaml/badge.svg)](https://github.com/gkoos/chaos-proxy/actions)
[![codecov](https://codecov.io/gh/gkoos/chaos-proxy/branch/main/graph/badge.svg)](https://codecov.io/gh/gkoos/chaos-proxy)

# Chaos Proxy

Chaos Proxy is a proxy server for injecting configurable network chaos (latency, failures, connection drops, rate-limiting, and transforms) into HTTP traffic.

Use it via CLI or programmatically with ordered middleware chains (global and per-route).

## Features

- YAML-based config with runtime reload support
- Built-in middleware primitives for latency, errors, drops, limits, throttling, and transforms
- Route matching by method and path
- Optional OpenTelemetry tracing export
- Extensible middleware registry

## Installation

```bash
npm install chaos-proxy
```

## Quick Start

### CLI

```bash
npx chaos-proxy --config chaos.yaml [--verbose]
```

### Programmatic API

```ts
import { loadConfig, startServer } from 'chaos-proxy';

const cfg = loadConfig('chaos.yaml'); // port comes from chaos.yaml
const server = await startServer(cfg);

// ...run your traffic through http://localhost:5000 (or whatever port is set in chaos.yaml)

await server.close();
```

### Minimal Config

```yaml
target: "http://localhost:4000"
port: 5000
global:
  - latency: 100
```

## Documentation

Detailed guides live in [docs/index.md](./docs/index.md):

- [Chaos middlewares](./docs/chaos-middlewares.md)
- [Observability](./docs/observability.md)
- [Hot reload](./docs/hot-reload.md)
- [Examples](./docs/examples.md)

## Presets

Ready-made chaos bundles are available in [presets](./presets):

- [mobile-3g.yaml](./presets/mobile-3g.yaml)
- [flaky-backend.yaml](./presets/flaky-backend.yaml)
- [burst-errors.yaml](./presets/burst-errors.yaml)
- [timeout-storm.yaml](./presets/timeout-storm.yaml)

## Runtime Reload

Chaos Proxy supports runtime config reload via `POST /reload`. See [docs/hot-reload.md](./docs/hot-reload.md) for full details.

## Join the Community

Have questions, want to discuss features, or share examples? Join the Fetch-Kit Discord server:

[![Discord](https://img.shields.io/badge/Discord-Join_Fetch--Kit-7289DA?logo=discord&logoColor=white)](https://discord.gg/sdyPBPCDUg)

## License

MIT