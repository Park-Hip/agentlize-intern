import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOOPBACK_HOST } from '@lab/shared';

const HEALTH_TIMEOUT_MS = 15_000;
const STOP_TIMEOUT_MS = 3_000;

/** lab/tests/dist is two levels below lab/. */
export const labRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export interface SpawnedService {
  readonly name: string;
  readonly child: ChildProcess;
  output(): string;
}

/** Ask the OS for several free ports while all listeners are still open. */
export async function freePorts(count: number): Promise<number[]> {
  const servers = await Promise.all(
    Array.from({ length: count }, () => {
      return new Promise<ReturnType<typeof createServer>>((resolveListen, rejectListen) => {
        const server = createServer();
        server.once('error', rejectListen);
        server.listen(0, LOOPBACK_HOST, () => resolveListen(server));
      });
    }),
  );

  const ports = servers.map((server) => {
    const address = server.address();
    if (address === null || typeof address !== 'object') {
      throw new Error('temporary listener did not report an address');
    }
    return address.port;
  });

  await Promise.all(
    servers.map((server) => {
      return new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => (error === undefined ? resolveClose() : rejectClose(error)));
      });
    }),
  );

  return ports;
}

/**
 * Start a built service entry point with captured stdout and stderr.
 * The capture lets the smoke test prove the service key never reaches a log.
 */
export function spawnBuiltService(packageDir: string, env: NodeJS.ProcessEnv): SpawnedService {
  const entry = join(labRoot, packageDir, 'dist', 'index.js');
  const child = spawn(process.execPath, [entry], {
    cwd: labRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let captured = '';
  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');
  child.stdout?.on('data', (chunk: string) => {
    captured += chunk;
  });
  child.stderr?.on('data', (chunk: string) => {
    captured += chunk;
  });

  return {
    name: packageDir,
    child,
    output: () => captured,
  };
}

export async function waitForHealth(service: SpawnedService, port: number): Promise<void> {
  const url = `http://${LOOPBACK_HOST}:${port}/health`;
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (service.child.exitCode !== null || service.child.signalCode !== null) {
      throw new Error(`${service.name} exited before answering ${url}\n${service.output()}`);
    }

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      await response.text();
      if (response.ok) return;
    } catch {
      // The service may not have bound its socket yet.
    }

    await new Promise((resolveSleep) => setTimeout(resolveSleep, 100));
  }

  throw new Error(`${service.name} did not answer ${url} within ${HEALTH_TIMEOUT_MS} ms\n${service.output()}`);
}

export async function stopChild(child: ChildProcess): Promise<void> {
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
