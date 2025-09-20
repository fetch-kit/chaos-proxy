import type { RequestHandler } from 'express';

const presetRegistry: Record<string, RequestHandler[]> = {};

export function registerPreset(name: string, middlewares: RequestHandler[]) {
  presetRegistry[name] = middlewares;
}

export function resolvePreset(name: string): RequestHandler[] {
  const preset = presetRegistry[name];
  if (!preset) throw new Error(`Unknown preset: ${name}`);
  return preset;
}
