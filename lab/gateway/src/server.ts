import { readPublicBaseUrl, readServiceKey, startService, type RunningService } from '@lab/shared';
import { createGatewayHandler } from './app.js';
import { openGatewayDatabase, resolveDataDir } from './database.js';
import { ApiKeyIdentity, KeyStore } from './identity/index.js';
import { createPolicyEngine } from './policy/index.js';
import { AcknowledgingExecutor, ProposalStore, type ProposalExecutor } from './proposals/index.js';
import { HttpSystems, systemUrl, type Systems } from './systems.js';
import { PROPOSE_TOOLS } from './tools/propose-tools.js';
import { READ_TOOLS } from './tools/read-tools.js';
import { TraceStore } from './trace/index.js';
import { SessionStore } from './web/session-store.js';

export interface GatewayOptions {
  /** Explicit port, used by tests with 0. Defaults to `LAB_GATEWAY_PORT`. */
  readonly port?: number;
  readonly env?: NodeJS.ProcessEnv;
  /** Replaces the HTTP clients of the two fake systems. Tests use it to inject a failure. */
  readonly systems?: Systems;
  /** Path of the rule file; defaults to `gateway/policy/rules.json`. */
  readonly rulesPath?: string;
  /** Replaces the clock. Tests use it to pass the 30 minutes of a proposal and the 15 minutes of a login. */
  readonly now?: () => Date;
  /** Replaces the executor that takes a confirmed proposal. Defaults to one that only acknowledges. */
  readonly executor?: ProposalExecutor;
}

export interface RunningGateway extends RunningService {
  readonly keys: KeyStore;
  readonly trace: TraceStore;
  readonly proposals: ProposalStore;
  readonly sessions: SessionStore;
}

/** Open the gateway database, then listen. The service key is required before either happens. */
export async function startGateway(options: GatewayOptions = {}): Promise<RunningGateway> {
  const env = options.env ?? process.env;
  const serviceKey = readServiceKey(env);

  const db = openGatewayDatabase(resolveDataDir(env));
  try {
    const keys = new KeyStore(db);
    const now = options.now ?? ((): Date => new Date());
    const trace = new TraceStore(db, now);
    const proposals = new ProposalStore(db, now);
    const sessions = new SessionStore(db, now);
    const publicBaseUrl = readPublicBaseUrl(env);
    // Without `LAB_PUBLIC_BASE_URL` the links use the address the gateway listens on, known once it is listening.
    let listeningUrl = '';
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
        tools: [...READ_TOOLS, ...PROPOSE_TOOLS],
        keys,
        proposals,
        sessions,
        executor: options.executor ?? new AcknowledgingExecutor(),
        publicBaseUrl: () => publicBaseUrl ?? listeningUrl,
        now,
      }),
    });

    listeningUrl = running.url;

    return {
      ...running,
      keys,
      trace,
      proposals,
      sessions,
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
