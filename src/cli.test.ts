
import { describe, it, expect } from 'vitest';
import { loadConfig } from './config/loader';
import { startServer } from './server';
import { parseConfig } from './config/parser';
import express from 'express';

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
    // Mock app.listen to avoid actually starting a server
    const originalListen = express.application.listen;
    let called = false;
  // @ts-expect-error: mocking express.application.listen for test
  express.application.listen = function(port: number, cb: () => void) {
      called = true;
      cb();
      return { close: () => {} };
    };
    startServer(config);
    express.application.listen = originalListen;
    expect(called).toBe(true);
  });
});
