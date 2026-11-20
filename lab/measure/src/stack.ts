import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DATA_DIR_ENV,
  LOOPBACK_HOST,
  PORT_ENV,
  PUBLIC_BASE_URL_ENV,
  RULES_PATH_ENV,
  SERVICE_KEY_ENV,
  TEST_HOOKS_ENV,
} from '@lab/shared';
import {
  freePorts,
  spawnBuiltService,
  stopChild,
  waitForHealth,
  type SpawnedService,
} from '@lab/tests/process';
import type { MeasureContext } from './types.js';

export interface MeasureStack {
  readonly dataDir: string;
  readonly serviceKey: string;
  readonly services: MeasureContext['services'];
  readonly output: () => string;
  /** Stop every child and delete the temporary data folder. Idempotent. */
  stop(): Promise<void>;
}

/**
 * Build a private stack: free loopback ports, a temporary data folder and a
 * random service key. It never reads `LAB_DATA_DIR`, `LAB_RULES_PATH` or the
 * service key from the caller's environment, so a measurement cannot touch
 * `lab/.data` or a stack the person already runs.
 */
export async function startMeasureStack(): Promise<MeasureStack> {
  const dataDir = await mkdtemp(join(tmpdir(), 'agentlize-measure-'));
  const ports = await freePorts(3);
  const directoryPort = ports[0];
  const tasksPort = ports[1];
  const gatewayPort = ports[2];
  if (directoryPort === undefined || tasksPort === undefined || gatewayPort === undefined) {
    throw new Error('could not reserve three loopback ports');
  }

  const serviceKey = randomBytes(32).toString('base64url');
  const gatewayUrl = `http://${LOOPBACK_HOST}:${gatewayPort}`;
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    [SERVICE_KEY_ENV]: serviceKey,
    [DATA_DIR_ENV]: dataDir,
    [RULES_PATH_ENV]: join(dataDir, 'rules.json'),
    [PUBLIC_BASE_URL_ENV]: gatewayUrl,
    [TEST_HOOKS_ENV]: '1',
    [PORT_ENV.directory]: String(directoryPort),
    [PORT_ENV.tasks]: String(tasksPort),
    [PORT_ENV.gateway]: String(gatewayPort),
  };

  const started: SpawnedService[] = [];
  let stopped = false;

  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    await Promise.all(started.map((service) => stopChild(service.child)));
    try {
      await rm(dataDir, { recursive: true, force: true });
    } catch {
      // A handle can outlive the process on Windows for a moment; the folder sits outside the repo.
    }
  };

  try {
    const directory = spawnBuiltService('fake-directory', env);
    started.push(directory);
    await waitForHealth(directory, directoryPort, serviceKey);

    const tasks = spawnBuiltService('fake-tasks', env);
    started.push(tasks);
    await waitForHealth(tasks, tasksPort, serviceKey);

    const gateway = spawnBuiltService('gateway', env);
    started.push(gateway);
    await waitForHealth(gateway, gatewayPort, serviceKey);

    return {
      dataDir,
      serviceKey,
      services: {
        gateway: gatewayUrl,
        directory: `http://${LOOPBACK_HOST}:${directoryPort}`,
        tasks: `http://${LOOPBACK_HOST}:${tasksPort}`,
      },
      output: () => started.map((service) => `--- ${service.name} ---\n${service.output()}`).join('\n'),
      stop,
    };
  } catch (cause) {
    await stop();
    throw cause;
  }
}
