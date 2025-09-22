[![npm](https://img.shields.io/npm/v/chaos-proxy)](https://www.npmjs.com/package/chaos-proxy)
[![Downloads](https://img.shields.io/npm/dm/chaos-proxy)](https://www.npmjs.com/package/chaos-proxy)
[![GitHub stars](https://img.shields.io/github/stars/gkoos/chaos-proxy?style=social)](https://github.com/gkoos/chaos-proxy)
[![Build](https://github.com/gkoos/chaos-proxy/actions/workflows/ci.yaml/badge.svg)](https://github.com/gkoos/chaos-proxy/actions)
[![codecov](https://codecov.io/gh/gkoos/chaos-proxy/branch/main/graph/badge.svg)](https://codecov.io/gh/gkoos/chaos-proxy)

# Chaos Proxy

Chaos Proxy is a proxy server for injecting configurable network chaos (latency, failures, connection drops, rate-limiting, etc.) into any HTTP or HTTPS traffic. Use it via CLI or programmatically to apply ordered middleware (global and per-route) and forward requests to your target server, preserving method, path, headers, query, and body.

---

## Features

- Simple configuration via a single `chaos.yaml` file
- Programmatic API and CLI usage
- Built-in middleware primitives: latency, latencyRange, fail, failRandomly, failNth, dropConnection, rateLimit, cors
- Extensible registry for custom middleware
- Built on Koa, it supports both request and response interception/modification
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
- `--verbose`: print loaded middlewares,  and request logs

### Programmatic API

```ts
import { loadConfig, startServer, registerMiddleware } from "chaos-proxy";

// Register custom middleware before starting the server
registerMiddleware('customDelay', (opts) => (req, res, next) => setTimeout(next, opts.ms));

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
- Middleware node: Object (`latency: 100`)

### Example

```yaml
target: "http://localhost:4000"
port: 5000
global:
  - latency: 100
  - failRandomly:
      rate: 0.1
      status: 503
routes:
  "GET /users/:id":
    - failRandomly:
        rate: 0.2
        status: 503
  "/users/:id/orders":
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
- `cors({ origin, methods, headers })` — enable and configure CORS headers. All options are strings.

### Rate Limiting

The `rateLimit` middleware restricts how many requests a client can make in a given time window. It uses `koa-ratelimit` under the hood.

- `limit`: Maximum number of requests allowed per window (e.g., 100)
- `windowMs`: Time window in milliseconds (e.g., 60000 for 1 minute)
- `key`: How to identify clients (default is IP, but can be a header name or a custom function)

How it works:
- Each incoming request is assigned a key (usually the client's IP address).
- The proxy tracks how many requests each key has made in the current window.
- If the number of requests exceeds `limit`, further requests from that key receive a `429 Too Many Requests` response until the window resets.
- You can customize the keying strategy to rate-limit by IP, by a specific header (e.g., `Authorization`), or by any custom logic.

This helps simulate API throttling, or test client retry logic under rate-limited conditions.

### CORS

The `cors` middleware enables Cross-Origin Resource Sharing (CORS) for your proxied API. By default, it allows all origins (`*`), methods (`GET,POST,PUT,DELETE,OPTIONS`), and headers (`Content-Type,Authorization`). You can customize these by providing string values:
- `origin`: Allowed origin(s) as a string (e.g., `"https://example.com"`).
- `methods`: Allowed HTTP methods as a comma-separated string (e.g., `"GET,POST"`).
- `headers`: Allowed headers as a comma-separated string (e.g., `"Authorization,Content-Type"`).

**Example:**
```yaml
global:
  - cors:
      origin: "https://example.com"
      methods: "GET,POST"
      headers: "Authorization,Content-Type"
```

---

## Extensibility

Register custom middleware: `registerMiddleware(name, factory)`

Under the hood, `chaos-proxy` uses [Koa](https://koajs.com/), so your custom middleware can leverage the full Koa context and ecosystem. Note that Koa middleware functions are async and take `(ctx, next)` parameters. Read more in the [Koa docs](https://koajs.com/#middleware). The reason for switching from Express to Koa is to enable async/await support which helps intercept both requests and responses more easily. In the /examples/middlewares folder, you can find a custom middleware implementation.

---

## Security & Limitations

- Proxy forwards all headers; be careful with sensitive tokens.
- Intended for local/dev/test only.
- HTTPS pass-through requires TLS termination; not supported out-of-the-box.
- Not intended for stress testing; connection limits apply.

---

## License

MIT

