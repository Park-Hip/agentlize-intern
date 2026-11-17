import { readServiceKey, startService, type RunningService } from '@lab/shared';
import { resolveDataDir, resolveRulesPath } from '@lab/gateway';
import { createConsoleHandler } from './handler.js';
import { serviceEndpoints } from './upstream.js';

export interface ConsoleOptions {
  /** Explicit port, used by tests with 0. Defaults to `LAB_CONSOLE_PORT`. */
  readonly port?: number;
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Start the operator console on loopback. It needs the same service key as the
 * other processes because it reads the fake systems directly, and it reads the
 * same rule file as the gateway (ADR-0006 section 3.1, 3.4).
 */
export async function startConsole(options: ConsoleOptions = {}): Promise<RunningService> {
  const env = options.env ?? process.env;
  const serviceKey = readServiceKey(env);
  const rulesPath = resolveRulesPath(resolveDataDir(env), env);

  return startService({
    service: 'console',
    env,
    ...(options.port === undefined ? {} : { port: options.port }),
    handler: createConsoleHandler({ endpoints: serviceEndpoints(env), serviceKey, rulesPath }),
  });
}
