import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DATA_DIR_ENV,
  LOOPBACK_HOST,
  PORT_ENV,
  SERVICE_KEY_ENV,
  SERVICES,
  readServiceKey,
  resolvePort,
  type ServiceName,
} from '@lab/shared';

const HEALTH_TIMEOUT_MS = 15_000;
const STOP_TIMEOUT_MS = 3_000;

const labRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const PACKAGE_DIR: Readonly<Record<ServiceName, string>> = {
  gateway: 'gateway',
  directory: 'fake-directory',
  tasks: 'fake-tasks',
  leave: 'fake-leave',
  console: 'console',
};

const START_ORDER = ['directory', 'tasks', 'leave'] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

/** Stop one child: ask it to exit, then force it after `timeoutMs`. Safe to call twice. */
export async function stopChild(child: ChildProcess | undefined, timeoutMs: number = STOP_TIMEOUT_MS): Promise<void> {
  if (child === undefined || child.exitCode !== null || child.signalCode !== null) return;

  await new Promise<void>((done) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      done();
    }, timeoutMs);

    child.once('exit', () => {
      clearTimeout(timer);
      done();
    });

    if (!child.kill('SIGTERM')) {
      clearTimeout(timer);
      done();
    }
  });
}

export interface StartStackOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly log?: (line: string) => void;
  readonly error?: (line: string) => void;
  /** Called once when a service dies while the stack is not stopping. */
  readonly onUnexpectedExit?: (name: ServiceName, code: number | null, signal: NodeJS.Signals | null) => void;
  /** Start the operator console too. `npm run tunnel` leaves it out because it never goes through the tunnel. */
  readonly includeConsole?: boolean;
}

export interface LabStack {
  readonly ports: Readonly<Record<ServiceName, number>>;
  readonly dataDir: string;
  readonly gatewayUrl: string;
  /** Stop every service this call started. Idempotent. */
  stop(): Promise<void>;
}

function spawnService(
  name: ServiceName,
  env: NodeJS.ProcessEnv,
  children: Map<ServiceName, ChildProcess>,
  options: StartStackOptions,
  error: (line: string) => void,
  isStopping: () => boolean,
  isReady: () => boolean,
  failStartup: (message: string) => void,
): ChildProcess {
  const entry = join(labRoot, PACKAGE_DIR[name], 'dist', 'index.js');
  const child = spawn(process.execPath, [entry], {
    cwd: labRoot,
    env,
    stdio: 'inherit',
  });

  const unexpected = (code: number | null, signal: NodeJS.Signals | null): void => {
    children.delete(name);
    if (!isReady()) {
      failStartup(`${name} exited during startup (code=${String(code)}, signal=${String(signal)})`);
      return;
    }
    if (isStopping()) return;
    error(`[start] ${name} exited unexpectedly (code=${String(code)}, signal=${String(signal)})`);
    options.onUnexpectedExit?.(name, code, signal);
  };

  child.on('error', (cause) => {
    children.delete(name);
    if (!isReady()) {
      failStartup(`${name} could not start: ${cause.message}`);
      return;
    }
    if (isStopping()) return;
    error(`[start] could not start ${name}: ${cause.message}`);
    options.onUnexpectedExit?.(name, null, null);
  });
  child.on('exit', unexpected);

  children.set(name, child);
  return child;
}

async function waitForHealth(
  name: ServiceName,
  port: number,
  child: ChildProcess,
  serviceKey: string,
): Promise<void> {
  const url = `http://${LOOPBACK_HOST}:${port}/health`;
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  let lastError = 'no response yet';

  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`${name} exited before answering ${url}`);
    }

    try {
      // The fake systems answer 401 to every request without the service key, /health included.
      const response = await fetch(url, {
        headers: { authorization: `Bearer ${serviceKey}` },
        signal: AbortSignal.timeout(1_000),
      });
      await response.text();
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (cause) {
      lastError = cause instanceof Error ? cause.message : String(cause);
    }

    await sleep(150);
  }

  throw new Error(`${name} did not answer ${url} within ${HEALTH_TIMEOUT_MS} ms (${lastError})`);
}

/**
 * Start the lab services on loopback and wait until each answers `/health`.
 * The gateway, the fake directory, the fake task list, the fake leave system
 * and, unless the caller opts out, the operator console start here. The caller
 * owns the returned stack and must call `stop()`. The service key is generated
 * here when the environment has none and is never printed.
 */
export async function startStack(options: StartStackOptions = {}): Promise<LabStack> {
  const env = options.env ?? process.env;
  const log = options.log ?? ((line: string) => console.log(line));
  const error = options.error ?? ((line: string) => console.error(line));
  const dataDir = resolve(env[DATA_DIR_ENV] ?? join(labRoot, '.data'));
  const includeConsole = options.includeConsole ?? true;
  const startedServices: readonly ServiceName[] = includeConsole
    ? SERVICES
    : ['gateway', 'directory', 'tasks', 'leave'];

  const ports: Record<ServiceName, number> = {
    gateway: resolvePort('gateway', env),
    directory: resolvePort('directory', env),
    tasks: resolvePort('tasks', env),
    leave: resolvePort('leave', env),
    console: resolvePort('console', env),
  };

  if (new Set(startedServices.map((name) => ports[name])).size !== startedServices.length) {
    const names = startedServices.map((name) => PORT_ENV[name]).join(', ');
    throw new Error(`${names} must be different`);
  }

  const serviceKey = env[SERVICE_KEY_ENV] ?? randomBytes(32).toString('base64url');
  const serviceEnv: NodeJS.ProcessEnv = {
    ...env,
    [SERVICE_KEY_ENV]: serviceKey,
    [DATA_DIR_ENV]: dataDir,
  };

  // Fail before spawning anything if an inherited key is too short.
  readServiceKey(serviceEnv);

  // The lark-task profile reassigns with add_members then remove_members; the gateway follows the same profile.
  if (serviceEnv['LAB_TASKS_PROFILE'] === 'lark-task') {
    serviceEnv['LAB_TASKS_ASSIGNEE_MODE'] = 'members';
  }

  for (const name of startedServices) {
    serviceEnv[PORT_ENV[name]] = String(ports[name]);
  }

  await mkdir(dataDir, { recursive: true });
  log(`[start] data folder ${dataDir}`);

  const children = new Map<ServiceName, ChildProcess>();
  let stopping = false;
  // Until the stack is complete, a dead child fails startup; the catch below
  // stops the rest. Only a child that dies after startup asks the caller to shut down.
  let ready = false;
  let startupFailure: string | null = null;

  const stop = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    const running = [...children.values()];
    children.clear();
    await Promise.all(running.map((child) => stopChild(child)));
  };

  const failStartup = (message: string): void => {
    startupFailure ??= message;
  };

  try {
    // ADR-0003: the fake systems become healthy before the gateway opens.
    for (const name of START_ORDER) {
      const child = spawnService(name, serviceEnv, children, options, error, () => stopping, () => ready, failStartup);
      await waitForHealth(name, ports[name], child, serviceKey);
      log(`[start] ${name} ready at http://${LOOPBACK_HOST}:${ports[name]}`);
    }

    const gateway = spawnService('gateway', serviceEnv, children, options, error, () => stopping, () => ready, failStartup);
    await waitForHealth('gateway', ports.gateway, gateway, serviceKey);
    log(`[start] gateway ready at http://${LOOPBACK_HOST}:${ports.gateway}`);

    // ADR-0006: the console opens only after the gateway answers, because its pages read the gateway.
    if (includeConsole) {
      const consoleService = spawnService(
        'console',
        serviceEnv,
        children,
        options,
        error,
        () => stopping,
        () => ready,
        failStartup,
      );
      await waitForHealth('console', ports.console, consoleService, serviceKey);
      log(`[start] console ready at http://${LOOPBACK_HOST}:${ports.console}`);
    }

    if (startupFailure !== null) throw new Error(startupFailure);
    for (const [name, child] of children) {
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`${name} exited during startup`);
      }
    }
    ready = true;
  } catch (cause) {
    await stop();
    throw cause;
  }

  return {
    ports,
    dataDir,
    gatewayUrl: `http://${LOOPBACK_HOST}:${ports.gateway}`,
    stop,
  };
}
