import { readServiceKey, startService, testHooksEnabled, type RunningService } from '@lab/shared';
import {
  KeyStore,
  openGatewayDatabase,
  resolveDataDir,
  resolveRulesPath,
  TraceReader,
} from '@lab/gateway';
import { createConsoleHandler } from './handler.js';
import { ConsoleKeyRing } from './key-ring.js';
import { serviceEndpoints } from './upstream.js';

export interface ConsoleOptions {
  /** Explicit port, used by tests with 0. Defaults to `LAB_CONSOLE_PORT`. */
  readonly port?: number;
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Start the operator console on loopback. It needs the same service key as the
 * other processes because it reads the fake systems and the gateway, and it
 * reads the same rule file and data folder as the gateway (ADR-0006 section 3.1, 3.6).
 * `LAB_TEST_HOOKS` reaches it through the same environment the fake systems got,
 * so the reset and fault buttons exist exactly when those routes exist.
 *
 * It also opens the gateway database: the `api_keys` table to issue and revoke
 * its own caller's keys (section 3.3) and the `trace` table to show the line of
 * one playground call (section 3.6). `close()` revokes every key this run issued.
 */
export async function startConsole(options: ConsoleOptions = {}): Promise<RunningService> {
  const env = options.env ?? process.env;
  const serviceKey = readServiceKey(env);
  const dataDir = resolveDataDir(env);
  const rulesPath = resolveRulesPath(dataDir, env);

  const db = openGatewayDatabase(dataDir);
  const keys = new ConsoleKeyRing(new KeyStore(db));
  const trace = new TraceReader(db);
  let closed = false;

  try {
    keys.start();
    const running = await startService({
      service: 'console',
      env,
      ...(options.port === undefined ? {} : { port: options.port }),
      handler: createConsoleHandler({
        endpoints: serviceEndpoints(env),
        serviceKey,
        rulesPath,
        dataDir,
        testHooks: testHooksEnabled(env),
        rawKeyFor: (employeeId) => keys.rawKeyFor(employeeId),
        trace,
      }),
    });

    return {
      ...running,
      async close(): Promise<void> {
        if (closed) return;
        closed = true;
        try {
          await running.close();
        } finally {
          try {
            keys.stop();
          } finally {
            db.close();
          }
        }
      },
    };
  } catch (error) {
    keys.stop();
    db.close();
    throw error;
  }
}
