import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import { KeyStore, openGatewayDatabase } from '@lab/gateway';
import { DATA_DIR_ENV, PORT_ENV, PUBLIC_BASE_URL_ENV, SERVICE_KEY_ENV } from '@lab/shared';
import { stopChild } from './stack.js';
import { startTunneledStack, waitForPublicDoor, type TunneledStack } from './tunnel.js';

/**
 * A sample quick tunnel address. Nothing listens there, so this test never
 * reaches the Internet: the fake `cloudflared` prints it and stays alive.
 */
const SAMPLE_PUBLIC_URL = 'https://brave-cat-123.trycloudflare.com';

interface TunnelSession {
  readonly tunnel: TunneledStack;
  readonly dataDir: string;
  readonly lines: readonly string[];
}

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

/** A stand-in for cloudflared: it prints one quick tunnel address and waits for a signal. */
async function startFakeCloudflared(dataDir: string): Promise<ChildProcess> {
  const script = join(dataDir, 'fake-cloudflared.mjs');
  await writeFile(
    script,
    [
      `process.stderr.write("INF |  ${SAMPLE_PUBLIC_URL}  |\\n");`,
      "process.on('SIGTERM', () => process.exit(0));",
      'setInterval(() => undefined, 1_000);',
      '',
    ].join('\n'),
    'utf8',
  );
  return spawn(process.execPath, [script], { stdio: ['ignore', 'pipe', 'pipe'] });
}

async function tunnelEnv(dataDir: string, configuredPublicBaseUrl?: string): Promise<NodeJS.ProcessEnv> {
  const ports = await freePorts(3);
  const [gatewayPort, directoryPort, tasksPort] = ports;
  if (gatewayPort === undefined || directoryPort === undefined || tasksPort === undefined) {
    throw new Error('the test could not reserve three ports');
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    [SERVICE_KEY_ENV]: randomBytes(32).toString('base64url'),
    [DATA_DIR_ENV]: dataDir,
    [PORT_ENV.gateway]: String(gatewayPort),
    [PORT_ENV.directory]: String(directoryPort),
    [PORT_ENV.tasks]: String(tasksPort),
  };
  // A value inherited from the developer's shell would hide the tunnel address.
  delete env[PUBLIC_BASE_URL_ENV];
  if (configuredPublicBaseUrl !== undefined) env[PUBLIC_BASE_URL_ENV] = configuredPublicBaseUrl;
  return env;
}

async function openSession(t: TestContext, configuredPublicBaseUrl?: string): Promise<TunnelSession> {
  const dataDir = await mkdtemp(join(tmpdir(), 'agentlize-tunnel-'));
  const env = await tunnelEnv(dataDir, configuredPublicBaseUrl);
  const child = await startFakeCloudflared(dataDir);
  const lines: string[] = [];

  let tunnel: TunneledStack;
  try {
    tunnel = await startTunneledStack(child, {
      env,
      log: (line) => lines.push(line),
      startLog: (line) => lines.push(line),
      startError: (line) => lines.push(line),
    });
  } catch (error) {
    await stopChild(child);
    await rm(dataDir, { recursive: true, force: true });
    throw error;
  }

  t.after(async () => {
    await stopChild(child);
    await tunnel.stack.stop();
    await rm(dataDir, { recursive: true, force: true });
  });

  return { tunnel, dataDir, lines };
}

/** Issue chị Hoa a key the way `npm run seed-keys` does, then read the link the tool returns. */
async function proposeAsHoa(session: TunnelSession): Promise<string> {
  const db = openGatewayDatabase(session.dataDir);
  let key: string;
  try {
    key = new KeyStore(db).issue({ employeeId: 'NV-02', caller: 'test' }).rawKey;
  } finally {
    db.close();
  }

  const response = await fetch(`${session.tunnel.stack.gatewayUrl}/v1/tools/propose_task_change`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ task_id: 'T-12', changes: { assignee: 'NV-04' } }),
  });
  const body = (await response.json()) as { text?: string };
  assert.equal(response.status, 200, body.text);
  assert.equal(typeof body.text, 'string');
  return body.text ?? '';
}

test('tunnel: the confirmation link uses the public address, not 127.0.0.1', async (t) => {
  const session = await openSession(t);
  const { tunnel } = session;

  assert.equal(tunnel.publicUrl, SAMPLE_PUBLIC_URL);
  assert.equal(tunnel.mcpUrl, `${SAMPLE_PUBLIC_URL}/mcp`);
  assert.equal(tunnel.publicBaseUrl, SAMPLE_PUBLIC_URL);
  assert.equal(tunnel.publicBaseUrlSource, 'tunnel');
  assert.equal(
    session.lines.some((line) => line.includes(`confirmation links use ${SAMPLE_PUBLIC_URL} (the tunnel address`)),
    true,
  );

  const text = await proposeAsHoa(session);
  const link = /Link xác nhận:\n(\S+)/.exec(text)?.[1];
  assert.equal(link?.startsWith(`${SAMPLE_PUBLIC_URL}/xac-nhan/`), true, text);
  assert.equal(text.includes('127.0.0.1'), false);

  // The public door check is unchanged: an initialize without a key is refused with 401.
  await waitForPublicDoor(`${tunnel.stack.gatewayUrl}/mcp`);
});

test('tunnel: a public address the runner set is kept and printed', async (t) => {
  const configured = 'https://ops.lab.example/';
  const session = await openSession(t, configured);
  const { tunnel } = session;

  assert.equal(tunnel.publicUrl, SAMPLE_PUBLIC_URL);
  assert.equal(tunnel.publicBaseUrl, 'https://ops.lab.example');
  assert.equal(tunnel.publicBaseUrlSource, 'configured');
  assert.equal(
    session.lines.some((line) =>
      line.includes(
        `confirmation links use https://ops.lab.example (from ${PUBLIC_BASE_URL_ENV}, not the tunnel address)`,
      ),
    ),
    true,
  );

  const text = await proposeAsHoa(session);
  const link = /Link xác nhận:\n(\S+)/.exec(text)?.[1];
  assert.equal(link?.startsWith('https://ops.lab.example/xac-nhan/'), true, text);
  assert.equal(text.includes(SAMPLE_PUBLIC_URL), false);
});
