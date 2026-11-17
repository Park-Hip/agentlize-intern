import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DATA_DIR_ENV, PORT_ENV, SERVICE_KEY_ENV } from '@lab/shared';
import { startStack } from './stack.js';

async function freePorts(count: number): Promise<number[]> {
  const servers = await Promise.all(
    Array.from({ length: count }, () => {
      return new Promise<ReturnType<typeof createServer>>((resolveListen, rejectListen) => {
        const server = createServer();
        server.once('error', rejectListen);
        server.listen(0, '127.0.0.1', () => resolveListen(server));
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

test('stack: starts the four services, answers health and stops every child', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'agentlize-stack-'));
  const [gatewayPort, directoryPort, tasksPort, consolePort] = await freePorts(4);
  const ports = {
    gateway: gatewayPort ?? 0,
    directory: directoryPort ?? 0,
    tasks: tasksPort ?? 0,
    console: consolePort ?? 0,
  };
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    [SERVICE_KEY_ENV]: randomBytes(32).toString('base64url'),
    [DATA_DIR_ENV]: dataDir,
    [PORT_ENV.gateway]: String(ports.gateway),
    [PORT_ENV.directory]: String(ports.directory),
    [PORT_ENV.tasks]: String(ports.tasks),
    [PORT_ENV.console]: String(ports.console),
  };
  const output: string[] = [];
  const stack = await startStack({
    env,
    log: (line) => output.push(line),
    error: (line) => output.push(line),
  });

  t.after(async () => {
    await stack.stop();
    await rm(dataDir, { recursive: true, force: true });
  });

  assert.deepEqual(stack.ports, ports);
  assert.equal(stack.gatewayUrl, `http://127.0.0.1:${ports.gateway}`);
  assert.equal(stack.dataDir, dataDir);
  assert.equal(output.some((line) => line.includes('[start] gateway ready')), true);
  assert.equal(output.some((line) => line.includes('[start] console ready')), true);

  const health = await fetch(`${stack.gatewayUrl}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: 'ok', service: 'gateway' });

  const consoleHealth = await fetch(`http://127.0.0.1:${ports.console}/health`);
  assert.equal(consoleHealth.status, 200);
  assert.deepEqual(await consoleHealth.json(), { status: 'ok', service: 'console' });

  await stack.stop();
  await stack.stop();
  await assert.rejects(fetch(`${stack.gatewayUrl}/health`, { signal: AbortSignal.timeout(1_000) }));
  await assert.rejects(fetch(`http://127.0.0.1:${ports.console}/health`, { signal: AbortSignal.timeout(1_000) }));
});

test('stack: the tunnel mode starts the three services and leaves the console off', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'agentlize-stack-no-console-'));
  const [gatewayPort, directoryPort, tasksPort, consolePort] = await freePorts(4);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    [SERVICE_KEY_ENV]: randomBytes(32).toString('base64url'),
    [DATA_DIR_ENV]: dataDir,
    [PORT_ENV.gateway]: String(gatewayPort),
    [PORT_ENV.directory]: String(directoryPort),
    [PORT_ENV.tasks]: String(tasksPort),
    [PORT_ENV.console]: String(consolePort),
  };
  const output: string[] = [];
  const stack = await startStack({
    env,
    includeConsole: false,
    log: (line) => output.push(line),
    error: (line) => output.push(line),
  });

  t.after(async () => {
    await stack.stop();
    await rm(dataDir, { recursive: true, force: true });
  });

  assert.equal(output.some((line) => line.includes('[start] console ready')), false);
  await assert.rejects(fetch(`http://127.0.0.1:${consolePort}/health`, { signal: AbortSignal.timeout(1_000) }));
  const health = await fetch(`${stack.gatewayUrl}/health`);
  assert.equal(health.status, 200);
  await health.text();
});

test('stack: a service that cannot bind does not leave the earlier services running', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'agentlize-stack-fail-'));
  const [gatewayPort, directoryPort, tasksPort] = await freePorts(3);
  const blocker = createServer((socket) => {
    // The health check may reach this port before the gateway exits; close at once.
    socket.destroy();
  });
  await new Promise<void>((resolveListen, rejectListen) => {
    blocker.once('error', rejectListen);
    blocker.listen(gatewayPort ?? 0, '127.0.0.1', () => resolveListen());
  });

  t.after(async () => {
    await new Promise<void>((resolveClose) => blocker.close(() => resolveClose()));
    await rm(dataDir, { recursive: true, force: true });
  });

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    [SERVICE_KEY_ENV]: randomBytes(32).toString('base64url'),
    [DATA_DIR_ENV]: dataDir,
    [PORT_ENV.gateway]: String(gatewayPort),
    [PORT_ENV.directory]: String(directoryPort),
    [PORT_ENV.tasks]: String(tasksPort),
  };

  await assert.rejects(
    startStack({ env, log: () => undefined, error: () => undefined }),
    /gateway/,
  );

  // The two fake systems were already healthy; a failed start must stop them.
  for (const port of [directoryPort, tasksPort]) {
    const probe = createServer();
    await new Promise<void>((resolveListen, rejectListen) => {
      probe.once('error', rejectListen);
      probe.listen(port ?? 0, '127.0.0.1', () => resolveListen());
    });
    await new Promise<void>((resolveClose) => probe.close(() => resolveClose()));
  }
});
