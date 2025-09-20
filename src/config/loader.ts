
import fs from 'fs';
import path from 'path';
import { parseConfig } from './parser.ts';

export type ChaosConfig = {
  target: string;
  port?: number;
  global?: unknown[];
  routes?: Record<string, unknown[]>;
};

export function loadConfig(configPath: string = 'chaos.yaml'): ChaosConfig {
  const absPath = path.isAbsolute(configPath)
    ? configPath
    : path.join(process.cwd(), configPath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`Config file not found: ${absPath}`);
  }
  const raw = fs.readFileSync(absPath, 'utf8');
  return parseConfig(raw);
}
