# Observability

Chaos Proxy supports optional OpenTelemetry tracing and a local observability stack.

## Included Components

- `otel` middleware with W3C `traceparent` propagation
- OTLP HTTP trace export to OpenTelemetry Collector
- Jaeger for trace exploration
- Prometheus for metrics (via collector spanmetrics)
- Grafana with a pre-provisioned dashboard

If `otel` is not configured, Chaos Proxy runs without telemetry export.

## Local Stack

Use the built-in scripts:

- `npm run obs:up`
- `npm run obs:validate`
- `npm run obs:ps`
- `npm run obs:logs`
- `npm run obs:down`
- `npm run obs:reset`

Endpoints:

- Grafana: `http://localhost:3000`
- Prometheus: `http://localhost:9090`
- Jaeger: `http://localhost:16686`
- Collector OTLP: `http://localhost:4318` (HTTP), `localhost:4317` (gRPC)

## otel Configuration

`otel` is a top-level config object in `chaos.yaml`.

```yaml
target: "http://localhost:4000"
port: 5000

otel:
  serviceName: "checkout-api"
  endpoint: "http://localhost:4318"
  flushIntervalMs: 1000
  maxBatchSize: 20
  maxQueueSize: 1000
  headers:
    x-tenant-id: "local-dev"

global:
  - latencyRange:
      minMs: 20
      maxMs: 120
```

Options:

- `serviceName` (required): service name label in traces
- `endpoint` (required): OTLP base endpoint
- `flushIntervalMs` (optional): export interval, default `5000`
- `maxBatchSize` (optional): batch size, default `100`
- `maxQueueSize` (optional): max queued spans, default `1000`
- `headers` (optional): extra OTLP request headers

Behavior notes:

- Existing incoming `traceparent` is continued.
- Missing incoming `traceparent` starts a new trace.
- Spans are marked as errors for HTTP status >= 400 or thrown middleware errors.
- `otel` is resolved before `global` middleware.

## Grafana Dashboard

Dashboard name: `Chaos Proxy Observability`
Dashboard UID: `chaos-proxy-observability`

## Troubleshooting

If no data appears:

1. Check services with `npm run obs:ps`.
2. Check collector targets in Prometheus at `http://localhost:9090/targets`.
3. Check traces in Jaeger using your configured `serviceName`.
4. Confirm Grafana datasource points to `http://prometheus:9090`.
5. Hard refresh Grafana after dashboard changes.
