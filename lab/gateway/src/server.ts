import { readPublicBaseUrl, readServiceKey, startService, type RunningService } from '@lab/shared';
import { createGatewayHandler } from './app.js';
import { openGatewayDatabase, resolveDataDir } from './database.js';
import { ApiKeyIdentity, KeyStore } from './identity/index.js';
import { createPolicyEngine, resolveRulesPath, seedRulesFile } from './policy/index.js';
import { ProposalStore, type ProposalExecutor } from './proposals/index.js';
import { HttpSystems, systemUrl, type Systems } from './systems.js';
import { PROPOSE_TOOLS } from './tools/propose-tools.js';
import { READ_TOOLS } from './tools/read-tools.js';
import { TraceStore } from './trace/index.js';
import { SessionStore } from './web/session-store.js';
import { CommandStore, TaskListExecutor } from './writes/index.js';

export interface GatewayOptions {
  /** Explicit port, used by tests with 0. Defaults to `LAB_GATEWAY_PORT`. */
  readonly port?: number;
  readonly env?: NodeJS.ProcessEnv;
  /** Replaces the HTTP clients of the two fake systems. Tests use it to inject a failure. */
  readonly systems?: Systems;
  /** Path of the rule file, overriding `LAB_RULES_PATH` and the file in the data folder. Tests use it. */
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
  readonly commands: CommandStore;
}

/** Open the gateway database, then listen. The service key is required before either happens. */
export async function startGateway(options: GatewayOptions = {}): Promise<RunningGateway> {
  const env = options.env ?? process.env;
  const serviceKey = readServiceKey(env);
  const dataDir = resolveDataDir(env);

  // The committed rule file is the base copy; the gateway reads the operator's copy in the data folder.
  // A test that passes its own path keeps full control of that file, so it is not seeded or overwritten.
  const rulesPath = options.rulesPath ?? resolveRulesPath(dataDir, env);
  if (options.rulesPath === undefined && seedRulesFile(rulesPath)) {
    console.log(`[gateway] copied the base rule file to ${rulesPath}`);
  }

  const db = openGatewayDatabase(dataDir);
  try {
    const keys = new KeyStore(db);
    const now = options.now ?? ((): Date => new Date());
    const trace = new TraceStore(db, now);
    const proposals = new ProposalStore(db, now);
    const sessions = new SessionStore(db, now);
    const commands = new CommandStore(db, now);
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

    const executor: ProposalExecutor =
      options.executor ?? new TaskListExecutor({ commands, proposals, systems, trace });

    const running = await startService({
      service: 'gateway',
      env,
      ...(options.port === undefined ? {} : { port: options.port }),
      handler: createGatewayHandler({
        identity: new ApiKeyIdentity(keys),
        policy: createPolicyEngine({ rulesPath }),
        systems,
        trace,
        tools: [...READ_TOOLS, ...PROPOSE_TOOLS],
        keys,
        proposals,
        sessions,
        commands,
        executor,
        publicBaseUrl: () => publicBaseUrl ?? listeningUrl,
        now,
      }),
    });

    listeningUrl = running.url;

    // A previous run may have confirmed a write and crashed before or during the send; settle those with their old keys.
    if (options.executor === undefined) {
      void executor.resume?.().catch((error: unknown) => {
        console.error(`[gateway] startup resend failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    }

    return {
      ...running,
      keys,
      trace,
      proposals,
      sessions,
      commands,
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
