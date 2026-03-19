import { loadConfig } from './config/loader';
import { startServer } from './server';
export type { ChaosProxyServer } from './server';
import { registerMiddleware } from './registry/middleware';
import { registerBuiltins } from './registry/builtin';

registerBuiltins();

export { loadConfig, startServer, registerMiddleware };
