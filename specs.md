# Chaos Proxy — Full Specification

## Overview

Chaos Proxy is an npm package and CLI tool for injecting configurable network chaos (latency, failures, connection drops, rate-limiting, etc.) into requests bound for an API. It runs as an Express-based proxy and applies ordered middleware nodes (global and per-route). The final handler forwards to the configured `target` while preserving path, method, headers, query parameters and body.

- **Audience:** JS/TS developers testing frontends or HTTP clients.  
- **Primary use:** exercise retry/backoff/circuit-breaker behavior and test resilience.  
- **Modes:** Programmatic API (for tests) and CLI (for manual/dev use).  
- **Default config file:** `chaos.yaml` (required; must include `target`).

---

## Goals & Non-goals

**Goals**

- Simple, predictable configuration via a single `chaos.yaml`.  
- Programmatic API to start/stop the proxy inside tests.  
- Useful built-in middleware primitives to simulate realistic HTTP failures.  
- Extensible registry so teams can register custom middleware factories and presets.  
- CLI for quick local testing and dev workflows.

**Non-goals**

- Replace Go-level, high-throughput tools (Toxiproxy). Not intended for massive stress testing.  
- Packet-level low-level manipulation (no raw packet injection).  
- Full production gateway features (LB, auth, complex routing).

---

## MVP acceptance criteria

- Loads and validates `chaos.yaml` (must include `target`).  
- Starts an Express-based proxy that forwards requests to `target`.  
- Supports ordered `global` and `routes` middleware lists.  
- Built-in middleware primitives: `latency`, `latencyRange`, `failRandomly`, `failNth`, `dropConnection`, `rateLimit`.  
- Built-in presets: `slowNetwork`, `flakyApi`.  
- YAML supports `preset:` prefix to reference named presets.  
- Programmatic API: `loadConfig`, `startServer`, `stopServer`, `registerMiddleware`, `registerPreset`.  
- CLI: `chaos-proxy --config <path>` (reads `chaos.yaml` by default).

---

## Recommended project layout

    chaos-proxy/
    ├─ bin/
    │  └─ chaos-proxy.js         # CLI entry (#!/usr/bin/env node)
    ├─ src/
    │  ├─ index.ts               # Programmatic exports (loadConfig, startServer, register*)
    │  ├─ server.ts              # Express app builder + lifecycle helpers
    │  ├─ config/
    │  │   └─ loader.ts          # YAML loader + schema validation
    │  ├─ registry/
    │  │   ├─ middleware.ts      # middlewareRegistry + registerMiddleware
    │  │   └─ presets.ts         # presetRegistry + registerPreset
    │  ├─ middlewares/           # built-in primitive factories
    │  │   ├─ latency.ts
    │  │   ├─ latencyRange.ts
    │  │   ├─ failRandomly.ts
    │  │   ├─ failNth.ts
    │  │   ├─ dropConnection.ts
    │  │   └─ rateLimit.ts
    │  └─ presets/               # built-in preset definitions (exports map)
    │       ├─ slowNetwork.ts
    │       └─ flakyApi.ts
    ├─ examples/
    │  └─ chaos.yaml             # example config file(s)
    ├─ package.json
    ├─ tsconfig.json
    └─ README.md

---

## Configuration (`chaos.yaml`)

**Default file:** `chaos.yaml` (CLI accepts `--config <path>` to override)

**Format rules**

- `target` (string) is required — the upstream API base URL.
- `port` (number) is optional — port for the proxy to listen on (default 5000).
- `global` is an ordered array of middleware nodes applied to every request (in order).  
- `routes` is a map: `path` → ordered array of middleware nodes applied only to that route.  
- A middleware node is either:
    - an object whose single key is a middleware primitive name and whose value is the options for that primitive, e.g.:
    
        latency: 100
    - a string starting with `preset:` followed by the preset name, e.g.:
    
        preset:slowNetwork
- Execution order: apply `global` nodes (top→bottom), then the route's nodes (top→bottom). No inheritance from parent routes to child routes by default.

**Example `chaos.yaml`:**

    target: "http://localhost:4000"

    global:
      - latency: 100
      - preset:slowNetwork
      - failRandomly:
          rate: 0.1
          status: 503

    routes:
      "/users/:id":
        - preset:slowNetwork
        - failRandomly:
            rate: 0.2
            status: 503

      "/users/:id/orders":
        - preset:flakyApi
        - failNth:
            n: 3
            status: 500

---

## Runtime semantics / proxy behavior

- Proxy preserves method, path, query params, headers, and request body.  
- For each request:
    1. Execute `global` middlewares in YAML order.  
    2. Execute route middlewares if matched.  
    3. If no middleware short-circuits, forward request to `target` and stream response back.  
- Short-circuiting middlewares (send response or drop connection) prevent upstream requests.  
- Route matching: Express-style paths (supports `:param`, `*`, etc.).  
- Non-composable: `/users/:id` middlewares do **not** run for `/users/:id/orders`.

---

## Middleware primitives (built-in)

### `latency(ms: number)`
Wait `ms` milliseconds before calling `next()`.

### `latencyRange(minMs: number, maxMs: number)`
Wait random time between `minMs` and `maxMs` before `next()`.

### `fail({ status?: number, body?: string })`
Respond early with `status` (default 503) and optional `body`. Otherwise call `next()`.

### `failRandomly({ rate: number, status?: number, body?: string })`
With probability `rate` respond early with `status` (default 503) and optional `body`. Otherwise call `next()`.

### `failNth({ n: number, status?: number, body?: string })`
Fail on the nth request (counter scoped to route). Reset counter on server restart.

### `dropConnection({ prob?: number })`
Destroy the socket with probability `prob` (default 1). Simulates mid-request disconnects.

### `rateLimit({ limit: number, windowMs: number, key?: string | (req)=>string })`
Simple token-bucket or fixed-window limiter keyed by IP/header/custom function. Exceeding limit returns `429`.

---

## Presets

Presets are named arrays of middleware instances, referenced via `preset:<name>` in YAML.

**Built-in presets**

- `slowNetwork` → `latencyRange(300, 1200)`, `failRandomly({ rate: 0.05, status: 504 })`  
- `flakyApi` → `failRandomly({ rate: 0.3, status: 503 })`, `dropConnection({ prob: 0.05 })`

**User-defined presets**

    registerPreset("chaotic", [
        latencyRange(100, 500),
        failRandomly({ rate: 0.2, status: 500 })
    ])

---

## Programmatic API

    import { loadConfig, startServer } from "chaos-proxy";

    const cfg = loadConfig("tests/chaos.yaml");
    const server = await startServer(cfg, { port: 5001 });

    // Do requests pointing at http://localhost:5001

    await server.close();

**Exports**

- `loadConfig(path?: string): Config`  
- `startServer(config: Config, options?: { port?: number, host?: string }): { port: number, close(): Promise<void> }`  
- `registerMiddleware(name: string, factory: (opts) => ExpressMiddleware)`  
- `registerPreset(name: string, middlewareArray: ExpressMiddleware[])`

---

## CLI

```
chaos-proxy [--config <path>] [--verbose]
```

- `--config <path>`: YAML config file (default `./chaos.yaml`)  
- `--verbose`: print loaded middlewares and basic request logs

---

## Implementation notes

- Use **Express** for routing and middleware semantics.  
- Use **http-proxy-middleware** (or `http-proxy`) for proxying to `target`, preserving request/response streaming and headers.  
- Middleware resolution:
    - String starting with `preset:` → lookup preset registry  
    - Object with a single key → lookup middleware registry  
- Mounting order:
    - `app.use(...globalMiddlewares)`  
    - `app.use(routePath, ...routeMiddlewares)`  
    - `app.use('*', proxyMiddleware({ target }))`

---

## Validation rules

- `target` must be a valid URL.  
- `global` must be an array if present.  
- `routes` must be map: path → array of nodes if present.
- Each node:
    - If string starting with `preset:`, preset must exist.  
    - If object, must have exactly one key that matches registered middleware.  
- Invalid config → throw clear error with file and line info.

---

## Testing recommendations

- Unit tests for built-in middleware behavior.  
- Unit tests for registry and resolver.  
- Integration test: dummy upstream server → chaos-proxy → assert delays/failures.  
- End-to-end: frontend/client points at chaos-proxy → assert retries/circuit-breakers.

---

## Security & limitations

- Proxy forwards all headers; be careful with sensitive tokens.  
- Intended for local/dev/test only.  
- HTTPS pass-through requires TLS termination; document if unsupported.  
- Not intended for stress testing; connection limits apply.
