import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DATA_DIR_ENV, LOOPBACK_HOST, PORT_ENV, SERVICE_KEY_ENV, type ServiceName } from '@lab/shared';
import { freePorts, spawnBuiltService, stopChild, waitForHealth, type SpawnedService } from './process.js';

test('smoke: three services start on temporary ports and answer /health', async (t) => {
  const key = randomBytes(32).toString('base64url');
  const dataDir = await mkdtemp(join(tmpdir(), 'agentlize-lab-'));
  const [directoryPort, tasksPort, gatewayPort] = await freePorts(3);

  const ports: Readonly<Record<ServiceName, number>> = {
    directory: directoryPort ?? 0,
    tasks: tasksPort ?? 0,
    gateway: gatewayPort ?? 0,
  };

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    [SERVICE_KEY_ENV]: key,
    [DATA_DIR_ENV]: dataDir,
    [PORT_ENV.directory]: String(ports.directory),
    [PORT_ENV.tasks]: String(ports.tasks),
    [PORT_ENV.gateway]: String(ports.gateway),
  };

  const started: SpawnedService[] = [];
  t.after(async () => {
    await Promise.all(started.map((service) => stopChild(service.child)));
    await rm(dataDir, { recursive: true, force: true });
  });

  const directory = spawnBuiltService('fake-directory', env);
  started.push(directory);
  await waitForHealth(directory, ports.directory, key);

  const tasks = spawnBuiltService('fake-tasks', env);
  started.push(tasks);
  await waitForHealth(tasks, ports.tasks, key);

  const gateway = spawnBuiltService('gateway', env);
  started.push(gateway);
  await waitForHealth(gateway, ports.gateway, key);

  const expected: ReadonlyArray<[ServiceName, number]> = [
    ['tasks', ports.tasks],
    ['gateway', ports.gateway],
  ];

  for (const [service, port] of expected) {
    const response = await fetch(`http://${LOOPBACK_HOST}:${port}/health`, {
      headers: { authorization: `Bearer ${key}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok', service });
  }

  // The directory answers only to the service key, even on /health.
  const directoryUrl = `http://${LOOPBACK_HOST}:${ports.directory}/health`;
  const anonymous = await fetch(directoryUrl);
  assert.equal(anonymous.status, 401);
  await anonymous.text();
  const authorized = await fetch(directoryUrl, { headers: { authorization: `Bearer ${key}` } });
  assert.equal(authorized.status, 200);
  assert.deepEqual(await authorized.json(), { status: 'ok', service: 'directory' });

  const logs = started.map((service) => service.output()).join('\n');
  assert.equal(logs.includes(key), false, 'the service key must never appear in service output');
});
