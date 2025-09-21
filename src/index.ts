import { loadConfig } from './config/loader';
import { startServer } from './server';
import { registerMiddleware } from './registry/middleware';
import { registerBuiltins } from './registry/builtin';

registerBuiltins();

export { loadConfig, startServer, registerMiddleware, registerBuiltins };
