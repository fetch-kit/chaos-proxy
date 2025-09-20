import yaml from 'yaml';
import { resolveMiddleware } from '../registry/middleware.ts';
import { resolvePreset } from '../registry/preset.ts';
import type { ChaosConfig } from './loader.ts';
import type { RequestHandler } from 'express';

export function parseConfig(yamlString: string): ChaosConfig {
  let parsed: any;
  try {
    parsed = yaml.parse(yamlString);
  } catch (e) {
    throw new Error(`YAML parse error: ${(e as Error).message}`);
  }
  // Basic validation
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Config must be a YAML object');
  }
  if (!parsed.target || typeof parsed.target !== 'string') {
    throw new Error('Config must include a string "target" field');
  }
  if (parsed.global && !Array.isArray(parsed.global)) {
    throw new Error('Config "global" must be an array');
  }
  if (parsed.routes && typeof parsed.routes !== 'object') {
    throw new Error('Config "routes" must be a map of path to array');
  }
  for (const [route, nodes] of Object.entries(parsed.routes || {})) {
    if (!Array.isArray(nodes)) {
      throw new Error(`Route "${route}" must map to an array of middleware nodes`);
    }
  }
  // Default port to 5000 if not specified
  if (!parsed.port) {
    parsed.port = 5000;
  }
  return parsed as ChaosConfig;
}

export function resolveConfigMiddlewares(config: ChaosConfig): { global: RequestHandler[], routes: Record<string, RequestHandler[]> } {
  const global: RequestHandler[] = [];
  const routes: Record<string, RequestHandler[]> = {};

  // Resolve global middlewares
  if (Array.isArray(config.global)) {
    for (const node of config.global) {
      if (typeof node === 'string' && node.startsWith('preset:')) {
        const presetName = node.slice(7);
        global.push(...resolvePreset(presetName));
      } else {
        global.push(resolveMiddleware(node));
      }
    }
  }

  // Resolve route middlewares
  if (config.routes && typeof config.routes === 'object') {
    for (const [route, nodes] of Object.entries(config.routes)) {
      const chain: RequestHandler[] = [];
      for (const node of nodes) {
        if (typeof node === 'string' && node.startsWith('preset:')) {
          const presetName = node.slice(7);
          chain.push(...resolvePreset(presetName));
        } else {
          chain.push(resolveMiddleware(node));
        }
      }
      routes[route] = chain;
    }
  }

  return { global, routes };
}
