# Chaos Middlewares

This guide covers the built-in middleware primitives, ordering, and behavior details.

## Middleware Order

Chaos Proxy runs middleware in this order:

1. Optional `otel` middleware (when configured)
2. `global` middleware chain
3. Matching route middleware chain

The first middleware to send a response or terminate the request flow short-circuits later middleware.

## Stream Detection

Chaos Proxy decides per response whether to treat it as a stream or a buffered body.

A response is treated as streamed when:

- `content-length` is missing, and
- either `transfer-encoding: chunked` is present, or
- `content-type` starts with `text/event-stream`

When streamed, `ctx.state.isStream` is set to `true`.

## Built-in Primitives

- `latency`: delays every request. Config: scalar milliseconds — `latency: 100`.
- `latencyRange`: delays every request by a random value. Config: `{ minMs, maxMs, seed? }`.
- `fail`: always responds with an error. Config: `{ status?, body? }`.
- `failRandomly`: fails with probability `rate`. Config: `{ rate, status?, body?, seed? }`.
- `failNth`: fails every nth request, then resets the counter. Config: `{ n, status?, body? }`.
- `dropConnection`: randomly closes the connection. Config: `{ prob?, seed? }`. Default `prob` is `1` (always drop).
- `rateLimit`: enforces fixed-window request limits. Config: `{ limit, windowMs, key? }`. When `key` is a string it is treated as a header name, falling back to `ctx.ip`, then `'unknown'`. When omitted, defaults to IP.
- `cors`: sets CORS headers. Config: `{ origin?, methods?, headers? }`. Defaults: `origin: '*'`, `methods: 'GET,POST,PUT,DELETE,OPTIONS'`, `headers: 'Content-Type,Authorization'`.
- `throttle`: limits response bandwidth. Config: `{ rate, chunkSize?, burst?, key? }`.
- `bodyTransform`: transforms request and/or response bodies. Config: `{ request?, response? }`.
- `headerTransform`: transforms request and/or response headers. Config: `{ request?, response? }`.

For randomness-based primitives (`latencyRange`, `failRandomly`, `dropConnection`), set `seed` for deterministic behavior.

## Middleware Node Shapes

YAML middleware entries are one-key objects. Example:

```yaml
global:
  - latency: 100        # scalar milliseconds
  - failRandomly:
      rate: 0.1
      status: 503
  - failNth:
      n: 5
      status: 500
```

## Rate Limit Details

`rateLimit` options:

- `limit`: max requests per window
- `windowMs`: fixed window duration in milliseconds
- `key`: client bucket strategy (IP/header/custom)

Example:

```yaml
global:
  - rateLimit:
      limit: 100
      windowMs: 60000
      key: "Authorization"
```

## Throttle Details

`throttle` options:

- `rate`: bytes per second
- `chunkSize`: chunk size in bytes (default `16384`)
- `burst`: burst bytes allowed before steady-state throttling
- `key`: optional per-client key strategy

Example:

```yaml
global:
  - throttle:
      rate: 1024
      chunkSize: 512
      burst: 2048
      key: "Authorization"
```

## Transform Middleware Details

### bodyTransform

- `request` transform receives `(body, ctx)` and returns a new body.
- `response` transform receives `(body, ctx)` and returns a new body.
- Response transforms are skipped for streamed responses.

YAML (string form):

```yaml
global:
  - bodyTransform:
      request: "(body, ctx) => { body.foo = 'bar'; return body; }"
      response: "(body, ctx) => { body.transformed = true; return body; }"
```

Programmatic (function form):

```ts
bodyTransform({
  request: (body, ctx) => { body.foo = 'bar'; return body; },
  response: (body, ctx) => { body.transformed = true; return body; },
})
```

### headerTransform

- `request` transform receives `(headers, ctx)` and returns new headers.
- `response` transform receives `(headers, ctx)` and returns new headers.

YAML (string form):

```yaml
global:
  - headerTransform:
      request: "(headers, ctx) => { headers['x-added'] = 'foo'; return headers; }"
      response: "(headers, ctx) => { headers['x-powered-by'] = 'chaos'; return headers; }"
```

Programmatic (function form):

```ts
headerTransform({
  request: (headers, ctx) => { headers['x-added'] = 'foo'; return headers; },
  response: (headers, ctx) => { headers['x-powered-by'] = 'chaos'; return headers; },
})
```

## Security Note

`bodyTransform` and `headerTransform` function strings are evaluated at runtime. Only use trusted config sources.
