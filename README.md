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
- Built-in middleware primitives: latency, latencyRange, fail, failRandomly, failNth, dropConnection, rateLimit, cors, throttle
- Extensible registry for custom middleware
- Built on Koa, it supports both request and response interception/modification
- Method+path route support (e.g., `GET /api/users`)
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

## Runtime Config Reload

Chaos Proxy supports full runtime reloads without process restart.

- Endpoint: `POST /reload`
- Content type: `application/json`
- Payload: full config snapshot (same shape as `chaos.yaml`)
- Behavior: build-then-swap (all-or-nothing)

### Request Example

```bash
curl -X POST http://localhost:5000/reload \
  -H "Content-Type: application/json" \
  -d '{
    "target": "http://localhost:4000",
    "port": 5000,
    "global": [
      { "latency": { "ms": 120 } },
      { "failRandomly": { "rate": 0.05, "status": 503 } }
    ],
    "routes": {
      "GET /users/:id": [
        { "failNth": { "n": 3, "status": 500 } }
      ]
    }
  }'
```

### Success Response

```json
{
  "ok": true,
  "version": 2,
  "reloadMs": 4
}
```

### Failure Responses

- `400` invalid config/payload (runtime state is unchanged)
- `409` reload already in progress
- `415` unsupported content type

```json
{
  "ok": false,
  "error": "Config must include a string \"target\" field",
  "version": 2,
  "reloadMs": 1
}
```

### Programmatic Reload

`startServer(...)` returns a server object with:

- `reloadConfig(newConfig)`
- `getRuntimeVersion()`

### Edge-Case Semantics

- In-flight requests are deterministic: they continue on the snapshot captured at request start.
- New requests after a successful swap use the new snapshot immediately.
- If a route is deleted in the new config, in-flight requests that already matched it still finish on the old snapshot.
- Middleware internal state is rebuilt on reload (for example, rate-limit/throttle counters reset).
- Reload is all-or-nothing: parse/validate/build failures never partially apply.

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
  - bodyTransform:
      request: "(body, ctx) => { body.foo = 'bar'; return body; }"
      response: "(body, ctx) => { body.transformed = true; return body; }"
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

### Routing

Chaos Proxy uses Koa Router for path matching, supporting named parameters (e.g., `/users/:id`), wildcards (e.g., `*`), and regex routes.

- Example: `"GET /api/*"` matches any GET request under `/api/`.
- Example: `"GET /users/:id"` matches GET requests like `/users/123`.

**Rule inheritance:**
- There is no inheritance between global and route-specific middleware.
- Global middlewares apply to every request.
- Route middlewares only apply to requests matching that route.
- Routes can be defined with or without HTTP methods. If a method is specified (e.g., `GET /path`), the rule only applies to that method. If no method is specified (e.g., `/path`), the rule applies to all methods for that path.
- If a request matches a route, only the middlewares for that route (plus global) are applied. Route rules do not inherit or merge from parent routes or wildcards.
- If multiple routes match, the most specific one is chosen (e.g., `/users/:id` over `/users/*`).
- If no route matches, only global middlewares are applied.
- Order of middleware execution: global middlewares run first, followed by route-specific middlewares in the order they are defined. Example: If you have a global latency of 100ms and a route-specific failNth, a request to that route will first incur the 100ms latency, then be subject to the failNth logic.
- Routes can be defined with or without HTTP methods. If a method is specified (e.g., `GET /path`), the rule only applies to that method. If no method is specified (e.g., `/path`), the rule applies to all methods for that path.

---

## Middleware Primitives

### Response Stream Handling

Chaos Proxy decides per response whether to treat it as a stream or a buffered body:

- Streamed responses are passed through as streams.
- Non-stream responses are buffered so response-body transforms can run.

Current stream detection marks a response as stream when:

- `content-length` is missing, and
- either `transfer-encoding: chunked` is present or `content-type` starts with `text/event-stream`.

When a response is detected as streamed, `ctx.state.isStream` is set to `true` for downstream middleware.

- `latency(ms)` — delay every request
- `latencyRange(minMs, maxMs, seed?)` — random delay (deterministic when `seed` is set)
- `fail({ status, body })` — always fail
- `failRandomly({ rate, status, body, seed? })` — fail with probability (deterministic when `seed` is set)
- `failNth({ n, status, body })` — fail every nth request
- `dropConnection({ prob, seed? })` — randomly drop connection (deterministic when `seed` is set)
- `rateLimit({ limit, windowMs, key })` — rate limiting (by IP, header, or custom)
- `cors({ origin, methods, headers })` — enable and configure CORS headers. All options are strings.
`throttle({ rate, chunkSize, burst, key })` — throttles bandwidth per request to a specified rate (bytes per second), with optional burst capacity and chunk size. The key option allows per-client throttling. (Implemented natively, not using koa-throttle.)
- `bodyTransform({ request?, response? })` — parse and mutate request and/or response body with custom functions.
- `headerTransform({ request?, response? })` — parse and mutate request and/or response headers with custom functions.

For randomness-based middlewares (`latencyRange`, `failRandomly`, `dropConnection`), you can set an optional `seed` to make behavior reproducible across runs (useful for CI and local debugging).

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

**Example:**
```yaml
global:
  - rateLimit:
      limit: 100
      windowMs: 60000
      key: "Authorization"
```

This configuration limits clients to 100 requests per minute, identified by their `Authorization` header.

This helps test client retry logic under rate-limited conditions.

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

This configuration restricts CORS to requests from `https://example.com` using only `GET` and `POST` methods, and allows the `Authorization` and `Content-Type` headers.


### Throttling

The `throttle` middleware limits the bandwidth of responses to simulate slow network conditions.

It supports stream, `Buffer`, and string response bodies.

- `rate`: The average rate (in bytes per second) to allow (e.g., 1024 for 1 KB/s).
- `chunkSize`: The size of each chunk to send (in bytes). Smaller chunks can simulate more granular throttling (default 16384).
- `burst`: The maximum burst size (in bytes) that can be sent at once (default 0, meaning no burst).
- `key`: How to identify clients for per-client throttling (default is IP, but can be a header name or a custom function).

**Example:**
```yaml
global:
  - throttle:
      rate: 1024        # 1 KB/s
      chunkSize: 512    # 512 bytes per chunk
      burst: 2048       # allow bursts up to 2 KB
      key: "Authorization"
```

This configuration throttles responses to an average of 1 KB/s, sending data in 512-byte chunks, with bursts up to 2 KB, identified by the `Authorization` header.

### Body Transform

The `bodyTransform` middleware allows you to parse and mutate both the request and response bodies using custom transformation functions. You can specify a `request` and/or `response` transform, each as either a JavaScript function string (for YAML config) or a real function (for programmatic usage). Backward compatibility with the old `transform` key is removed—use the new object shape only.

How it works:
- Parses the request body and makes it available as `ctx.request.body`.
- If a `request` transform is provided, it is called with the parsed body and Koa context, and its return value replaces `ctx.request.body`.
- After downstream middleware and proxying, if a `response` transform is provided and `ctx.state.isStream` is not `true`, it is called with the response body (`ctx.body`) and Koa context, and its return value replaces `ctx.body`.
- For streamed responses (`ctx.state.isStream === true`), response transform is skipped.
- Both transforms can be used independently or together.

**Example (YAML):**
```yaml
global:
  - bodyTransform:
      request: "(body, ctx) => { body.foo = 'bar'; return body; }"
      response: "(body, ctx) => { body.transformed = true; return body; }"
```

This configuration adds a `foo: 'bar'` property to every JSON request body and a `transformed: true` property to every JSON response body.

**Note:**
For maximum flexibility, the `request` and `response` options in `bodyTransform` can be specified as JavaScript function strings in your YAML config. This allows you to define custom transformation logic directly in the config file. Be aware that evaluating JS from config can introduce security and syntax risks. Use with care and only in trusted environments.

`bodyTransform` request transforms still operate on parsed request bodies. Response transforms operate on non-stream responses only; streamed responses are passed through unchanged.

If you call `startServer` programmatically, you can also pass real functions instead of strings:

```ts
import { startServer, bodyTransform } from 'chaos-proxy';

startServer({
  target: 'http://localhost:4000',
  port: 5000,
  global: [
    bodyTransform({
      request: (body, ctx) => {
        body.foo = 'bar';
        return body;
      },
      response: (body, ctx) => {
        body.transformed = true;
        return body;
      }
    })
  ]
});
```

### Header Transform

The `headerTransform` middleware allows you to parse and mutate both the request and response headers using custom transformation functions. You can specify a `request` and/or `response` transform, each as either a JavaScript function string (for YAML config) or a real function (for programmatic usage).

How it works:
- If a `request` transform is provided, it is called with a copy of the request headers and Koa context, and its return value replaces `ctx.request.headers`.
- After downstream middleware and proxying, if a `response` transform is provided, it is called with a copy of the response headers and Koa context, and its return value replaces `ctx.response.headers`.
- Both transforms can be used independently or together.

**Example (YAML):**
```yaml
global:
  - headerTransform:
      request: "(headers, ctx) => { headers['x-added'] = 'foo'; return headers; }"
      response: "(headers, ctx) => { headers['x-powered-by'] = 'chaos'; return headers; }"
```

This configuration adds an `x-added: foo` header to every request and an `x-powered-by: chaos` header to every response.

**Note:**
For maximum flexibility, the `request` and `response` options in `headerTransform` can be specified as JavaScript function strings in your YAML config. This allows you to define custom transformation logic directly in the config file. Be aware that evaluating JS from config can introduce security and syntax risks. Use with care and only in trusted environments.

If you call `startServer` programmatically, you can also pass real functions instead of strings:

```ts
import { startServer, headerTransform } from 'chaos-proxy';

startServer({
  target: 'http://localhost:4000',
  port: 5000,
  global: [
    headerTransform({
      request: (headers, ctx) => {
        headers['x-added'] = 'foo';
        return headers;
      },
      response: (headers, ctx) => {
        headers['x-powered-by'] = 'chaos';
        return headers;
      }
    })
  ]
});
```

---

## Preset Chaos Bundles

The `presets/` directory contains ready-to-use YAML configurations for common chaos scenarios. Each preset applies its middleware stack globally (to every route) via the `global` array.

| Preset | What it simulates |
|---|---|
| `mobile-3g.yaml` | High-latency, bandwidth-limited mobile connection with occasional drops |
| `flaky-backend.yaml` | Unstable upstream: intermittent 503s, connection drops, and latency jitter |
| `burst-errors.yaml` | Periodic error bursts: every 5th request fails, plus a 10% background error rate |
| `timeout-storm.yaml` | Timeout storm: requests take 1–8s, frequent connection drops, and 504s |

### Using a preset

Copy the preset file, set `target` and `port` to match your service, then run:

```bash
npx chaos-proxy --config presets/mobile-3g.yaml
```

### Combining presets

Because chaos-proxy uses a single config file, combining presets means merging their `global` arrays manually into one file. For example, to layer `flaky-backend` behaviour on top of `mobile-3g`:

```yaml
target: "http://localhost:4000"
port: 5000
global:
  # from mobile-3g
  - latencyRange:
      minMs: 100
      maxMs: 300
  - throttle:
      rate: 51200
      chunkSize: 1024
      burst: 10240
  # from flaky-backend
  - failRandomly:
      rate: 0.05
      status: 503
  - dropConnection:
      prob: 0.02
```

Middleware executes top-to-bottom, so put latency first if you want the added delay to precede error injection.

---

## Extensibility

You can register custom middleware factories using `registerMiddleware(name, factory)`. Once registered, your middleware can be referenced by name in any config, including reload payloads.

```ts
import { registerMiddleware, startServer } from 'chaos-proxy';

// Register before starting the server
registerMiddleware('customLogger', (opts) => {
  const prefix = opts.prefix ?? '[chaos]';
  return async (ctx, next) => {
    console.log(`${prefix} ${ctx.method} ${ctx.url}`);
    await next();
  };
});

const server = startServer({
  target: 'http://localhost:4000',
  port: 5000,
  global: [
    { customLogger: { prefix: '[myapp]' } }
  ],
});
```

Then reference it in YAML:

```yaml
global:
  - customLogger:
      prefix: "[myapp]"
```

Or in a reload payload:

```json
{
  "target": "http://localhost:4000",
  "global": [
    { "customLogger": { "prefix": "[spike]" } }
  ]
}
```

**Rules:**
- Middleware must be registered in the running process before it is referenced in a config or reload payload.
- If a reload payload references an unknown middleware name, the reload fails and the active runtime is unchanged.
- Factories receive an `opts` object from config and must return a Koa `async (ctx, next)` middleware function.
- For response-aware custom middleware, use `ctx.state.isStream` to branch behavior for streamed responses.
- See [examples/middlewares/](examples/middlewares/) for a working example.

---

## Security & Limitations

- Proxy forwards all headers; be careful with sensitive tokens.
- Intended for local/dev/test only.
- HTTPS pass-through requires TLS termination; not supported out-of-the-box.
- Not intended for stress testing; connection limits apply.

---

## Join the Community

Have questions, want to discuss features, or share examples? Join the **Fetch-Kit Discord server**:

[![Discord](https://img.shields.io/badge/Discord-Join_Fetch--Kit-7289DA?logo=discord&logoColor=white)](https://discord.gg/sdyPBPCDUg)


---

## License

MIT