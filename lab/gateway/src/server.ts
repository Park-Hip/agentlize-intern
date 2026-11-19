import { readPublicBaseUrl, readServiceKey, startService, type RunningService } from '@lab/shared';
import { createHttpAdapters, systemUrl, type ResourceAdapter } from './adapters/index.js';
import { createGatewayHandler } from './app.js';
import { openGatewayDatabase, resolveDataDir } from './database.js';
import { ApiKeyIdentity, KeyStore, PagePasswordStore } from './identity/index.js';
import { createPolicyEngine, resolveRulesPath, seedRulesFile } from './policy/index.js';
import { ProposalStore, type ProposalExecutor } from './proposals/index.js';
import { PROPOSE_TOOLS } from './tools/propose-tools.js';
import { READ_TOOLS } from './tools/read-tools.js';
import { TraceStore } from './trace/index.js';
import { SessionStore } from './web/session-store.js';
import { CommandStore, Outbox } from './writes/index.js';

export interface GatewayOptions {
  /** Explicit port, used by tests with 0. Defaults to `LAB_GATEWAY_PORT`. */
  readonly port?: number;
  readonly env?: NodeJS.ProcessEnv;
  /** Replaces the registered system adapters. Tests use it to inject a failure. */
  readonly adapters?: readonly ResourceAdapter[];
  /** Path of the rule file, overriding `LAB_RULES_PATH` and the file in the data folder. Tests use it. */
  readonly rulesPath?: string;
  /** Replaces the clock. Tests use it to pass the 30 minutes of a proposal and the 15 minutes of a login. */
  readonly now?: () => Date;
  /** Replaces the executor that takes a confirmed proposal. Defaults to the background outbox. */
  readonly executor?: ProposalExecutor;
}

export interface RunningGateway extends RunningService {
  readonly keys: KeyStore;
  readonly pagePasswords: PagePasswordStore;
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
    const pagePasswords = new PagePasswordStore(db);
    const now = options.now ?? ((): Date => new Date());
    const trace = new TraceStore(db, now);
    const proposals = new ProposalStore(db, now);
    const sessions = new SessionStore(db, now);
    const commands = new CommandStore(db, now);
    const publicBaseUrl = readPublicBaseUrl(env);
    // Without `LAB_PUBLIC_BASE_URL` the links use the address the gateway listens on, known once it is listening.
    let listeningUrl = '';
    const adapters =
      options.adapters ??
      createHttpAdapters({
        directoryUrl: systemUrl('directory', env),
        tasksUrl: systemUrl('tasks', env),
        serviceKey,
      });

    let outbox: Outbox | undefined;
    let executor: ProposalExecutor;
    if (options.executor === undefined) {
      outbox = new Outbox({ commands, proposals, adapters, trace, now });
      executor = outbox;
    } else {
      executor = options.executor;
    }

    const running = await startService({
      service: 'gateway',
      env,
      ...(options.port === undefined ? {} : { port: options.port }),
      handler: createGatewayHandler({
        identity: new ApiKeyIdentity(keys),
        policy: createPolicyEngine({ rulesPath }),
        adapters,
        trace,
        tools: [...READ_TOOLS, ...PROPOSE_TOOLS],
        keys,
        pagePasswords,
        proposals,
        sessions,
        commands,
        executor,
        publicBaseUrl: () => publicBaseUrl ?? listeningUrl,
        now,
      }),
    });

    listeningUrl = running.url;

    // Every command a previous run left open is picked up by this first round, with no separate startup path.
    outbox?.start();

    return {
      ...running,
      keys,
      pagePasswords,
      trace,
      proposals,
      sessions,
      commands,
      async close(): Promise<void> {
        try {
          await running.close();
        } finally {
          try {
            await outbox?.close();
          } finally {
            db.close();
          }
        }
      },
    };
  } catch (error) {
    db.close();
    throw error;
  }
}
