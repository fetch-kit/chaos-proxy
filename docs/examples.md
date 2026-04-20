# Examples

This page collects practical ways to run Chaos Proxy.

## Example Sources

- Project examples: [../examples/README.md](../examples/README.md)
- Presets: [../presets](../presets)

## Route-Specific Example

```yaml
target: "http://localhost:4000"
port: 5000
global:
  - latency: 50
routes:
  "GET /users/:id":
    - failNth:
        n: 3
        status: 500
        body: "Every third request fails"
```

## Runtime Reload Example

See [hot-reload.md](./hot-reload.md) for the full endpoint reference and curl examples.

## Preset Example

```bash
npx chaos-proxy --config presets/mobile-3g.yaml
```

To combine presets, merge their `global` arrays into one config file and keep middleware in intended execution order.
