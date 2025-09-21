import { loadConfig } from './config/loader';
import { startServer } from './server';
import { registerMiddleware } from './registry/middleware';
import { registerPreset } from './registry/preset';
import { registerBuiltins } from './registry/builtin';

registerBuiltins();

export { loadConfig, startServer, registerMiddleware, registerPreset, registerBuiltins };
