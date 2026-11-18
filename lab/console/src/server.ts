import { readServiceKey, startService, testHooksEnabled, type RunningService } from '@lab/shared';
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
 * same rule file and data folder as the gateway (ADR-0006 section 3.1, 3.6).
 * `LAB_TEST_HOOKS` reaches it through the same environment the fake systems got,
 * so the reset and fault buttons exist exactly when those routes exist.
 */
export async function startConsole(options: ConsoleOptions = {}): Promise<RunningService> {
  const env = options.env ?? process.env;
  const serviceKey = readServiceKey(env);
  const dataDir = resolveDataDir(env);
  const rulesPath = resolveRulesPath(dataDir, env);

  return startService({
    service: 'console',
    env,
    ...(options.port === undefined ? {} : { port: options.port }),
    handler: createConsoleHandler({
      endpoints: serviceEndpoints(env),
      serviceKey,
      rulesPath,
      dataDir,
      testHooks: testHooksEnabled(env),
    }),
  });
}
