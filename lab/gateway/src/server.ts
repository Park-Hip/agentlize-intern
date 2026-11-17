import { readServiceKey, startService, type RunningService } from '@lab/shared';
import { createGatewayHandler } from './app.js';
import { openGatewayDatabase, resolveDataDir } from './database.js';
import { ApiKeyIdentity, KeyStore } from './identity/index.js';
import { createPolicyEngine } from './policy/index.js';
import { HttpSystems, systemUrl, type Systems } from './systems.js';
import { READ_TOOLS } from './tools/read-tools.js';
import { TraceStore } from './trace/index.js';

export interface GatewayOptions {
  /** Explicit port, used by tests with 0. Defaults to `LAB_GATEWAY_PORT`. */
  readonly port?: number;
  readonly env?: NodeJS.ProcessEnv;
  /** Replaces the HTTP clients of the two fake systems. Tests use it to inject a failure. */
  readonly systems?: Systems;
  /** Path of the rule file; defaults to `gateway/policy/rules.json`. */
  readonly rulesPath?: string;
}

export interface RunningGateway extends RunningService {
  readonly keys: KeyStore;
  readonly trace: TraceStore;
}

/** Open the gateway database, then listen. The service key is required before either happens. */
export async function startGateway(options: GatewayOptions = {}): Promise<RunningGateway> {
  const env = options.env ?? process.env;
  const serviceKey = readServiceKey(env);

  const db = openGatewayDatabase(resolveDataDir(env));
  try {
    const keys = new KeyStore(db);
    const trace = new TraceStore(db);
    const systems =
      options.systems ??
      new HttpSystems({
        directoryUrl: systemUrl('directory', env),
        tasksUrl: systemUrl('tasks', env),
        serviceKey,
      });

    const running = await startService({
      service: 'gateway',
      env,
      ...(options.port === undefined ? {} : { port: options.port }),
      handler: createGatewayHandler({
        identity: new ApiKeyIdentity(keys),
        policy: createPolicyEngine(options.rulesPath === undefined ? {} : { rulesPath: options.rulesPath }),
        systems,
        trace,
        tools: READ_TOOLS,
      }),
    });

    return {
      ...running,
      keys,
      trace,
      async close(): Promise<void> {
        try {
          await running.close();
        } finally {
          db.close();
        }
      },
    };
  } catch (error) {
    db.close();
    throw error;
  }
}
