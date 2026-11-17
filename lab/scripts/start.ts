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
};

const START_ORDER = ['directory', 'tasks'] as const;

const children = new Map<ServiceName, ChildProcess>();
let stopping = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;

  await new Promise<void>((done) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      done();
    }, STOP_TIMEOUT_MS);
    timer.unref();

    child.once('exit', () => {
      clearTimeout(timer);
      done();
    });

    child.kill('SIGTERM');
  });
}

async function stopAll(): Promise<void> {
  const running = [...children.values()];
  children.clear();
  await Promise.all(running.map((child) => stopChild(child)));
}

async function shutdown(exitCode: number): Promise<void> {
  if (stopping) return;
  stopping = true;
  if (exitCode === 0) {
    console.log('[start] stopping services');
  }
  await stopAll();
  process.exit(exitCode);
}

function unexpectedExit(name: ServiceName, code: number | null, signal: NodeJS.Signals | null): void {
  children.delete(name);
  if (stopping) return;
  console.error(`[start] ${name} exited unexpectedly (code=${String(code)}, signal=${String(signal)})`);
  void shutdown(1);
}

function spawnService(name: ServiceName, env: NodeJS.ProcessEnv): ChildProcess {
  const entry = join(labRoot, PACKAGE_DIR[name], 'dist', 'index.js');
  const child = spawn(process.execPath, [entry], {
    cwd: labRoot,
    env,
    stdio: 'inherit',
  });

  child.on('error', (error) => {
    console.error(`[start] could not start ${name}: ${error.message}`);
    if (!stopping) void shutdown(1);
  });
  child.on('exit', (code, signal) => unexpectedExit(name, code, signal));

  children.set(name, child);
  return child;
}

async function waitForHealth(name: ServiceName, port: number, child: ChildProcess, serviceKey: string): Promise<void> {
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
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await sleep(150);
  }

  throw new Error(`${name} did not answer ${url} within ${HEALTH_TIMEOUT_MS} ms (${lastError})`);
}

async function main(): Promise<void> {
  const env = process.env;
  const dataDir = resolve(env[DATA_DIR_ENV] ?? join(labRoot, '.data'));

  const ports: Record<ServiceName, number> = {
    gateway: resolvePort('gateway', env),
    directory: resolvePort('directory', env),
    tasks: resolvePort('tasks', env),
  };

  if (new Set(Object.values(ports)).size !== 3) {
    throw new Error(`${PORT_ENV.gateway}, ${PORT_ENV.directory} and ${PORT_ENV.tasks} must be different`);
  }

  const serviceKey = env[SERVICE_KEY_ENV] ?? randomBytes(32).toString('base64url');
  const serviceEnv: NodeJS.ProcessEnv = {
    ...env,
    [SERVICE_KEY_ENV]: serviceKey,
    [DATA_DIR_ENV]: dataDir,
  };

  // Fail before spawning anything if an inherited key is too short.
  readServiceKey(serviceEnv);

  for (const name of ['gateway', 'directory', 'tasks'] as const) {
    serviceEnv[PORT_ENV[name]] = String(ports[name]);
  }

  await mkdir(dataDir, { recursive: true });
  console.log(`[start] data folder ${dataDir}`);

  // ADR-0003: the fake systems become healthy before the gateway opens.
  for (const name of START_ORDER) {
    const child = spawnService(name, serviceEnv);
    await waitForHealth(name, ports[name], child, serviceKey);
    console.log(`[start] ${name} ready at http://${LOOPBACK_HOST}:${ports[name]}`);
  }

  const gateway = spawnService('gateway', serviceEnv);
  await waitForHealth('gateway', ports.gateway, gateway, serviceKey);
  console.log(`[start] gateway ready at http://${LOOPBACK_HOST}:${ports.gateway}`);
  console.log('[start] all services ready, press Ctrl+C to stop');
}

process.once('SIGINT', () => void shutdown(0));
process.once('SIGTERM', () => void shutdown(0));

await main().catch(async (error: unknown) => {
  console.error(`[start] failed: ${error instanceof Error ? error.message : String(error)}`);
  await shutdown(1);
});
