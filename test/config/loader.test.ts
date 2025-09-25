import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../src/config/loader';

describe('loadConfig', () => {
  it('throws if config file is missing', () => {
    expect(() => loadConfig('not-a-real-file.yaml')).toThrow(/Config file not found/);
  });
});
