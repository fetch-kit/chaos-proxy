import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config/loader';
import { startServer } from '../src/server';
import { parseConfig } from '../src/config/parser';
// No longer needed: import express from 'express';

describe('chaos-proxy CLI logic', () => {
  it('throws error for missing config file', () => {
    expect(() => loadConfig('not-a-real-file.yaml')).toThrow(/Config file not found/);
  });

  it('throws error for missing target in config', () => {
    const yaml = 'port: 1234';
    expect(() => parseConfig(yaml)).toThrow(/Config must include a string "target" field/);
  });

  it('starts server with valid config (dry run)', () => {
    const config = { target: 'http://localhost:1234', port: 5678 };
    const server = startServer(config);
    expect(server).toBeDefined();
    if (typeof server.close === 'function') server.close();
  });
});
