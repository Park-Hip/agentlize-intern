import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { LOOPBACK_HOST } from '@lab/shared';
import { TOOL_DECLARATIONS } from './tools.js';

const HEALTH_TIMEOUT_MS = 15_000;
const STOP_TIMEOUT_MS = 3_000;
/** A test-only value: it starts a throwaway gateway on loopback and never leaves this file. */
const SERVICE_KEY = 'catalog-parity-test-key-0123456789';

/** `assistants/dist/function-calling` is three levels below `lab/`. */
const labRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

interface GatewayCatalog {
  tools: {
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((ready, fail) => {
    server.once('error', fail);
    server.listen(0, LOOPBACK_HOST, () => ready());
  });
  const address = server.address();
  assert.ok(address !== null && typeof address === 'object', 'the temporary listener must report a port');
  await new Promise<void>((done, fail) => server.close((error) => (error === undefined ? done() : fail(error))));
  return address.port;
}

/** Start the built gateway alone: the catalog needs no fake system behind it. */
function spawnGateway(port: number, dataDir: string): { child: ChildProcess; output: () => string } {
  const child = spawn(process.execPath, [join(labRoot, 'gateway', 'dist', 'index.js')], {
    cwd: labRoot,
    env: {
      ...process.env,
      LAB_SERVICE_KEY: SERVICE_KEY,
      LAB_DATA_DIR: dataDir,
      LAB_RULES_PATH: join(dataDir, 'rules.json'),
      LAB_GATEWAY_PORT: String(port),
    },
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

  return { child, output: () => captured };
}

async function waitForHealth(url: string, child: ChildProcess, output: () => string): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`the gateway exited before answering ${url}\n${output()}`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      await response.text();
      if (response.ok) return;
    } catch {
      // The gateway may not have bound its socket yet.
    }
    await sleep(150);
  }
  throw new Error(`the gateway did not answer ${url} within ${HEALTH_TIMEOUT_MS} ms\n${output()}`);
}

async function stop(child: ChildProcess): Promise<void> {
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

/**
 * Assistant B declares the six tools by hand, so only a test can notice when
 * the gateway's words move. This starts the real gateway and compares the
 * published catalog with that declaration, character for character and
 * schema for schema (issue #136).
 * The gateway also publishes `action_status`, the second name for the same
 * question (issue #155). The assistant does not declare it, because two names
 * for one question would only make the model choose between them.
 */
test('function door: the hand-declared catalog matches the real gateway for every tool it declares', async (t) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'agentlize-catalog-parity-'));
  const port = await freePort();
  const gateway = spawnGateway(port, dataDir);
  t.after(async () => {
    await stop(gateway.child);
    await rm(dataDir, { recursive: true, force: true });
  });

  const url = `http://${LOOPBACK_HOST}:${port}`;
  await waitForHealth(`${url}/health`, gateway.child, gateway.output);

  const response = await fetch(`${url}/v1/tools`);
  assert.equal(response.status, 200);
  const body = (await response.json()) as GatewayCatalog;
  const published = body.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.input_schema,
  }));
  const declared = TOOL_DECLARATIONS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));

  assert.deepEqual(
    published.filter((tool) => declared.some((known) => known.name === tool.name)),
    declared,
    'every declared tool must match GET /v1/tools, character for character and schema for schema',
  );
  assert.deepEqual(
    published.filter((tool) => !declared.some((known) => known.name === tool.name)).map((tool) => tool.name),
    ['action_status'],
    'the one extra name is the alias, and a second name for one question stays out of the hand-written catalog',
  );
  const direct = published.find((tool) => tool.name === 'get_request_status');
  const alias = published.find((tool) => tool.name === 'action_status');
  assert.ok(direct !== undefined && alias !== undefined);
  assert.deepEqual({ ...alias, name: direct.name }, direct, 'the alias publishes the same words and schema');
});
