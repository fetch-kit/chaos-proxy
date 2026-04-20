import yaml from 'yaml';
import { resolveMiddleware } from '../registry/middleware';
// ...existing code...
import type { ChaosConfig } from './loader';
import type { Middleware } from 'koa';

export function validateConfigObject(parsed: unknown): ChaosConfig {
  // Basic validation
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Config must be a YAML object');
  }
  const config = parsed as Record<string, unknown>;
  if (!config.target || typeof config.target !== 'string') {
    throw new Error('Config must include a string "target" field');
  }
  if (config.global && !Array.isArray(config.global)) {
    throw new Error('Config "global" must be an array');
  }
  if (config.otel && typeof config.otel !== 'object') {
    throw new Error('Config "otel" must be an object');
  }
  if (config.routes && typeof config.routes !== 'object') {
    throw new Error('Config "routes" must be a map of path to array');
  }
  for (const [route, nodes] of Object.entries(config.routes || {})) {
    if (!Array.isArray(nodes)) {
      throw new Error(`Route "${route}" must map to an array of middleware nodes`);
    }
  }
  // Default port to 5000 if not specified
  if (!config.port) {
    config.port = 5000;
  }
  return config as ChaosConfig;
}

export function parseConfig(yamlString: string): ChaosConfig {
  let parsed: unknown;
  try {
    parsed = yaml.parse(yamlString);
  } catch (e) {
    throw new Error(`YAML parse error: ${(e as Error).message}`);
  }
  return validateConfigObject(parsed);
}

export function resolveConfigMiddlewares(config: ChaosConfig): {
  global: Middleware[];
  routes: Record<string, Middleware[]>;
} {
  const global: Middleware[] = [];
  const routes: Record<string, Middleware[]> = {};
  const globalNodes: Record<string, unknown>[] = [
    ...(config.otel
      ? [{ otel: config.otel as Record<string, unknown> }]
      : []),
    ...((config.global ?? []) as Record<string, unknown>[]),
  ];

  // Resolve global middlewares
  for (const node of globalNodes) {
    global.push(resolveMiddleware(node));
  }

  // Resolve route middlewares
  if (config.routes && typeof config.routes === 'object') {
    for (const [route, nodes] of Object.entries(config.routes)) {
      const chain: Middleware[] = [];
      for (const node of nodes) {
        chain.push(resolveMiddleware(node as Record<string, unknown>));
      }
      routes[route] = chain;
    }
  }

  return { global, routes };
}
