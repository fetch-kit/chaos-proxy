[![npm](https://img.shields.io/npm/v/chaos-proxy)](https://www.npmjs.com/package/chaos-proxy)
[![Downloads](https://img.shields.io/npm/dm/chaos-proxy)](https://www.npmjs.com/package/chaos-proxy)
[![GitHub stars](https://img.shields.io/github/stars/gkoos/chaos-proxy?style=social)](https://github.com/gkoos/chaos-proxy)
[![Build](https://github.com/gkoos/chaos-proxy/actions/workflows/ci.yml/badge.svg)](https://github.com/gkoos/chaos-proxy/actions)
[![codecov](https://codecov.io/gh/gkoos/chaos-proxy/branch/main/graph/badge.svg)](https://codecov.io/gh/gkoos/chaos-proxy)

# Chaos Proxy

Chaos Proxy is an Express-based proxy and CLI tool for injecting configurable network chaos (latency, failures, connection drops, rate-limiting, etc.) into API requests. It applies ordered middleware (global and per-route) and forwards to your target API, preserving method, path, headers, query, and body.

---

## Features

- Simple configuration via a single `chaos.yaml` file
- Programmatic API and CLI usage
- Built-in middleware primitives: latency, latencyRange, fail, failRandomly, failNth, dropConnection, rateLimit
- Built-in presets: slowNetwork, flakyApi
- Extensible registry for custom middleware and presets
- Method+path route support (e.g., `GET /api/cc`)
- Robust short-circuiting: middlewares halt further processing when sending a response or dropping a connection

---

## Installation

```bash
npm install chaos-proxy
```

---

## Usage

### CLI

```bash
npx chaos-proxy --config chaos.yaml [--verbose]
```
- `--config <path>`: YAML config file (default `./chaos.yaml`)
- `--verbose`: print loaded middlewares, presets, and request logs

### Programmatic API

```ts
import { loadConfig, startServer, registerMiddleware, registerPreset } from "chaos-proxy";

// Register custom middleware or presets before starting the server
registerMiddleware('customDelay', (opts) => (req, res, next) => setTimeout(next, opts.ms));
registerPreset('chaotic', [
	latencyRange(100, 500),
	failRandomly({ rate: 0.2, status: 500 })
]);

const cfg = loadConfig("chaos.yaml");
const server = await startServer(cfg, { port: 5001 });
// Do requests pointing at http://localhost:5001

// Shutdown the server when done
await server.close();
```

---

## Configuration (`chaos.yaml`)

### Format

- `target` (string, required): Upstream API base URL
- `port` (number, optional): Proxy listen port (default 5000)
- `global`: Ordered array of middleware nodes applied to every request
- `routes`: Map of path or method+path to ordered array of middleware nodes
- Middleware node: Either an object (`latency: 100`), or a string starting with `preset:`

### Example

```yaml
target: "http://localhost:4000"
port: 5000
global:
  - latency: 100
  - preset:slowNetwork
  - failRandomly:
      rate: 0.1
      status: 503
routes:
  "GET /users/:id":
    - preset:slowNetwork
    - failRandomly:
        rate: 0.2
        status: 503
  "/users/:id/orders":
    - preset:flakyApi
    - failNth:
        n: 3
        status: 500
```

---

## Middleware Primitives

- `latency(ms)` — delay every request
- `latencyRange(minMs, maxMs)` — random delay
- `fail({ status, body })` — always fail
- `failRandomly({ rate, status, body })` — fail with probability
- `failNth({ n, status, body })` — fail every nth request
- `dropConnection({ prob })` — randomly drop connection
- `rateLimit({ limit, windowMs, key })` — rate limiting (by IP, header, or custom)

### Rate Limiting

The `rateLimit` middleware restricts how many requests a client can make in a given time window. It uses `express-rate-limit` under the hood.

- `limit`: Maximum number of requests allowed per window (e.g., 100)
- `windowMs`: Time window in milliseconds (e.g., 60000 for 1 minute)
- `key`: How to identify clients (default is IP, but can be a header name or a custom function)

How it works:
- Each incoming request is assigned a key (usually the client's IP address).
- The proxy tracks how many requests each key has made in the current window.
- If the number of requests exceeds `limit`, further requests from that key receive a `429 Too Many Requests` response until the window resets.
- You can customize the keying strategy to rate-limit by IP, by a specific header (e.g., `Authorization`), or by any custom logic.

This helps simulate API throttling, or test client retry logic under rate-limited conditions.

---

## Presets

Presets are named arrays of middleware instances, referenced via `preset:<name>` in YAML.

**Built-in presets:**
- `slowNetwork`: latencyRange(300, 1200), failRandomly({ rate: 0.05, status: 504 })
- `flakyApi`: failRandomly({ rate: 0.3, status: 503 }), dropConnection({ prob: 0.05 })

**User-defined presets:**
```ts
registerPreset("chaotic", [
	latencyRange(100, 500),
	failRandomly({ rate: 0.2, status: 500 })
]);
```

---

## Extensibility

- Register custom middleware: `registerMiddleware(name, factory)`
- Register custom presets: `registerPreset(name, [middlewares])`

---

## Security & Limitations

- Proxy forwards all headers; be careful with sensitive tokens.
- Intended for local/dev/test only.
- HTTPS pass-through requires TLS termination; not supported out-of-the-box.
- Not intended for stress testing; connection limits apply.

---

## License

MIT

