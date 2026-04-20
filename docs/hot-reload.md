# Hot Reload

Chaos Proxy supports full runtime config reload without a process restart.

## How It Works

When a reload is triggered:

1. The new payload is parsed and validated (same rules as `chaos.yaml`).
2. Middleware chains are compiled against the new config.
3. The compiled snapshot is swapped atomically.
4. In-flight requests that started before the swap continue running on the previous snapshot.
5. All new requests after the swap use the new snapshot immediately.

If parsing or validation fails, the swap is aborted and the running config is unchanged.

## Reload Endpoint

```
POST /reload
Content-Type: application/json
```

The payload is the full config object in the same shape as `chaos.yaml`.

### Request Example

```bash
curl -X POST http://localhost:5000/reload \
  -H "Content-Type: application/json" \
  -d '{
    "target": "http://localhost:4000",
    "port": 5000,
    "global": [
      { "latency": 120 },
      { "failRandomly": { "rate": 0.05, "status": 503 } }
    ],
    "routes": {
      "GET /users/:id": [
        { "failRandomly": { "rate": 0.2, "status": 500 } }
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

`version` increments on every successful reload.

### Error Responses

| Status | Meaning |
|--------|---------|
| `400` | Invalid config or payload — running config is unchanged |
| `409` | Another reload is already in progress |
| `415` | Unsupported `Content-Type` (must be `application/json`) |

```json
{
  "ok": false,
  "error": "Config must include a string \"target\" field",
  "version": 2,
  "reloadMs": 1
}
```

## Programmatic Reload

`startServer(...)` returns an object with:

- `reloadConfig(newConfig)` — swap the config programmatically
- `getRuntimeVersion()` — returns the current snapshot version number
- `close()` — gracefully shut down the server

```ts
import { loadConfig, startServer } from 'chaos-proxy';

const server = await startServer(loadConfig('chaos.yaml'));

// Inject extra chaos at runtime
await server.reloadConfig({
  target: 'http://localhost:4000',
  port: 5000,
  global: [
    { failRandomly: { rate: 0.3, status: 503 } },
  ],
});

console.log('Now at version', server.getRuntimeVersion());
```

## Edge Cases

- In-flight requests are deterministic: they finish on the snapshot captured when the request arrived.
- If a route is removed in the new config, in-flight requests that already matched it still complete on the old snapshot.
- Middleware internal state (for example rate-limit counters, throttle state) is rebuilt from scratch on every reload.
- Reload is all-or-nothing — partial application never occurs.
