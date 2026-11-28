import { readPublicBaseUrl, readServiceKey, startService, type RunningService } from '@lab/shared';
import { createHttpAdapters, systemUrl, type ResourceAdapter } from './adapters/index.js';
import { createGatewayHandler } from './app.js';
import { createAuthorizationRegistry, type AuthorizationRegistry } from './authorization/index.js';
import { openGatewayDatabase, resolveDataDir } from './database.js';
import { KeyStore, PagePasswordStore } from './identity/index.js';
import { createOAuthSurface, type OAuthSurface } from './oauth/http.js';
import { GrantAuthorizationResolver } from './oauth/grants/index.js';
import { createGatewayIdentity } from './oauth/identity.js';
import type { OAuthInteractionHandler } from './oauth/interaction-types.js';
import { createOAuthInteractionPages } from './oauth/web/handler.js';
import {
  configuredIssuer,
  DEFAULT_OAUTH_CLIENTS,
  loadOAuthKeys,
  type OAuthClientRegistration,
} from './oauth/provider.js';
import { hasOAuthState } from './oauth/storage/index.js';
import { createPolicyEngine, resolveRulesPath, seedRulesFile } from './policy/index.js';
import { ProposalStore, type ProposalExecutor } from './proposals/index.js';
import { PROPOSE_TOOLS } from './tools/propose-tools.js';
import { READ_TOOLS } from './tools/read-tools.js';
import type { RegisteredTool } from './tools/types.js';
import { TraceStore } from './trace/index.js';
import { SessionStore } from './web/session-store.js';
import { CommandStore, Outbox } from './writes/index.js';

export interface OAuthGatewayOptions {
  /** Overrides the issuer; the default is `LAB_OAUTH_ISSUER`, then `LAB_PUBLIC_BASE_URL`, then the listen address. */
  readonly issuer?: string;
  readonly clients?: readonly OAuthClientRegistration[];
  /**
   * Replaces the login and consent pages of issue #181. When absent the
   * gateway registers its own pages; `null` leaves no page, so the router
   * answers 503 instead of opening the provider's development views.
   */
  readonly interaction?: OAuthInteractionHandler | null | undefined;
}

export interface GatewayOptions {
  /** Explicit port, used by tests with 0. Defaults to `LAB_GATEWAY_PORT`. */
  readonly port?: number;
  readonly env?: NodeJS.ProcessEnv;
  /** Replaces the registered system adapters. Tests use it to inject a failure. */
  readonly adapters?: readonly ResourceAdapter[];
  /** Extra tools a test registers beside the shipped ones; production passes none. */
  readonly extraTools?: readonly RegisteredTool[];
  /** Path of the rule file, overriding `LAB_RULES_PATH` and the file in the data folder. Tests use it. */
  readonly rulesPath?: string;
  /** Replaces the clock. Tests use it to pass the 30 minutes of a proposal and the 15 minutes of a login. */
  readonly now?: () => Date;
  /** Replaces the executor that takes a confirmed proposal. Defaults to the background outbox. */
  readonly executor?: ProposalExecutor;
  /** The OAuth side: issuer, registered clients and the interaction handler. Defaults to the two Lab clients. */
  readonly oauth?: OAuthGatewayOptions;
}

export interface RunningGateway extends RunningService {
  readonly keys: KeyStore;
  readonly pagePasswords: PagePasswordStore;
  /** Exposes the one resolver so a provider can register a kind, and tests can swap a fake one. */
  readonly authorization: AuthorizationRegistry;
  readonly trace: TraceStore;
  readonly proposals: ProposalStore;
  readonly sessions: SessionStore;
  readonly commands: CommandStore;
  /** The OAuth surface: discovery, the provider and the stable grants; null until the listen address is known. */
  readonly oauth: OAuthSurface;
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
  let started: RunningService | undefined;
  try {
    const keys = new KeyStore(db);
    const now = options.now ?? ((): Date => new Date());
    // The registry shares the app clock, so a grant deadline is judged at the same moment as the rest of a step.
    const authorization = createAuthorizationRegistry(keys, now);
    const pagePasswords = new PagePasswordStore(db);
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
        leaveUrl: systemUrl('leave', env),
        serviceKey,
      });

    const oauthClients = options.oauth?.clients ?? DEFAULT_OAUTH_CLIENTS;
    const oauthConfig = loadOAuthKeys({
      env,
      dataDir,
      clients: oauthClients,
      hasStoredState: () => hasOAuthState(db),
      now,
    });
    // The OAuth surface is built once the listen address is known, so the issuer is fixed, never read from a request.
    const oauthHolder: { surface?: OAuthSurface } = {};
    const identity = createGatewayIdentity(keys, () => oauthHolder.surface?.tokenLookup, now);

    let outbox: Outbox | undefined;
    let executor: ProposalExecutor;
    if (options.executor === undefined) {
      outbox = new Outbox({ commands, proposals, adapters, trace, authorization, now });
      executor = outbox;
    } else {
      executor = options.executor;
    }

    // One policy engine for the tool doors and the OAuth consent page, read from the same rule file.
    const policy = createPolicyEngine({ rulesPath, declarations: adapters });

    const service = await startService({
      service: 'gateway',
      env,
      ...(options.port === undefined ? {} : { port: options.port }),
      handler: createGatewayHandler({
        identity,
        authorization,
        oauth: () => oauthHolder.surface,
        policy,
        adapters,
        trace,
        tools: [...READ_TOOLS, ...PROPOSE_TOOLS, ...(options.extraTools ?? [])],
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
    started = service;
    listeningUrl = service.url;

    const issuer =
      options.oauth?.issuer === undefined ? configuredIssuer(env, listeningUrl) : options.oauth.issuer;
    // Issue #181: the login and consent pages are the default handler, so a
    // running gateway never opens the provider's development views. A test may
    // still pass its own handler, or `null` to prove the 503 path.
    let interaction: OAuthInteractionHandler | undefined;
    const custom = options.oauth?.interaction;
    if (custom === null) {
      interaction = undefined;
    } else if (custom !== undefined) {
      interaction = custom;
    } else {
      interaction = createOAuthInteractionPages({
        db,
        pagePasswords,
        clients: oauthClients,
        adapters,
        policy,
        issuer,
        log: (line) => console.error(`[gateway] ${line}`),
      });
    }

    const oauth = createOAuthSurface({
      issuer,
      db,
      config: oauthConfig,
      clients: oauthClients,
      ...(interaction === undefined ? {} : { interaction }),
      now,
      log: (line) => console.error(`[gateway] ${line}`),
    });
    oauthHolder.surface = oauth;
    // A proposal drafted through a token carries the grant id; the pages and the outbox resolve it here.
    authorization.register(new GrantAuthorizationResolver(oauth.grants));

    // Every command a previous run left open is picked up by this first round, with no separate startup path.
    outbox?.start();

    return {
      ...service,
      keys,
      pagePasswords,
      authorization,
      trace,
      proposals,
      sessions,
      commands,
      oauth,
      async close(): Promise<void> {
        try {
          await service.close();
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
    if (started !== undefined) {
      await started.close().catch(() => undefined);
    }
    db.close();
    throw error;
  }
}
