#!/usr/bin/env node

import { loadConfig, startServer } from './index';

const args = process.argv.slice(2);
let configPath = 'chaos.yaml';
let verbose = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--config') {
    const nextArg = args[i + 1];
    if (nextArg) {
      configPath = String(nextArg);
      i++;
    } else {
      console.error('Missing value for --config');
      process.exit(1);
    }
  } else if (args[i] === '--verbose') {
    verbose = true;
  }
}

try {
  const config = loadConfig(configPath);
  if (verbose) {
    console.log('Loaded config:', configPath);
  }
  startServer(config, { verbose });
} catch (err) {
  const error = err as Error;
  if (error.message?.includes('Config file not found')) {
    console.error(`\nError: Could not find config file: ${configPath}`);
    console.error(
      'Please create a chaos.yaml file in your project root or specify a path with --config <path>.'
    );
  } else {
    console.error('Config error:', error.message);
  }
  process.exit(1);
}
