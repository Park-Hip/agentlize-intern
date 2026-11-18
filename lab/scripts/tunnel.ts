import { spawn, type ChildProcess } from 'node:child_process';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_BASE_URL_ENV, type ServiceName } from '@lab/shared';
import { startStack, stopChild, type LabStack } from './stack.js';
import {
  CLOUDFLARED_PATH_ENV,
  armCloseAt,
  choosePublicBaseUrl,
  closeAt,
  cloudflaredEnv,
  describePublicBaseUrl,
  formatClock,
  parseTunnelUrl,
  planTunnel,
  type PublicBaseUrlSource,
} from './tunnel-plan.js';

const CLOUDFLARED_START_TIMEOUT_MS = 60_000;
const PUBLIC_DOOR_TIMEOUT_MS = 60_000;
const STOP_TIMEOUT_MS = 5_000;
const PROTOCOL_VERSION = '2025-06-18';

const labRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function log(line: string): void {
  console.log(`[tunnel] ${line}`);
}

async function requireCloudflared(path: string): Promise<void> {
  try {
    await access(path, constants.X_OK);
  } catch {
    throw new Error(`cloudflared not found at "${path}". Install it there or set ${CLOUDFLARED_PATH_ENV}.`);
  }
}

/**
 * Forward cloudflared output and resolve with the first quick tunnel address.
 * The listeners stay attached after that, so later messages still show up.
 */
export function waitForPublicUrl(child: ChildProcess): Promise<string> {
  return new Promise<string>((resolveUrl, rejectUrl) => {
    let buffer = '';
    let found: string | null = null;
    const timer = setTimeout(() => {
      rejectUrl(new Error(`cloudflared did not print a public address within ${CLOUDFLARED_START_TIMEOUT_MS / 1_000} seconds`));
    }, CLOUDFLARED_START_TIMEOUT_MS);
    timer.unref();

    const finish = (url: string): void => {
      found = url;
      clearTimeout(timer);
      resolveUrl(url);
    };

    const read = (chunk: Buffer): void => {
      buffer += chunk.toString('utf8');
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, '').trim();
        buffer = buffer.slice(index + 1);
        if (line !== '') log(`cloudflared: ${line}`);
        const url = parseTunnelUrl(line);
        if (url !== null && found === null) finish(url);
        index = buffer.indexOf('\n');
      }
    };

    child.stdout?.on('data', read);
    child.stderr?.on('data', read);
    child.once('error', (cause) => {
      clearTimeout(timer);
      if (found === null) rejectUrl(cause);
    });
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      if (found === null) {
        rejectUrl(new Error(`cloudflared exited before a public address (code=${String(code)}, signal=${String(signal)})`));
      }
    });
  });
}

/**
 * Prove the public door reaches the gateway. No key is sent, so a working door
 * answers 401. A successful 200 here would mean the gateway let an anonymous
 * call through, and the session must stop.
 */
export async function waitForPublicDoor(mcpUrl: string): Promise<void> {
  const deadline = Date.now() + PUBLIC_DOOR_TIMEOUT_MS;
  let last = 'no response yet';

  while (Date.now() < deadline) {
    try {
      const response = await fetch(mcpUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: { name: 'lab-tunnel-check', version: '0.0.0' },
          },
        }),
        signal: AbortSignal.timeout(10_000),
      });
      await response.text();
      if (response.status === 401) return;
      last = `HTTP ${response.status}`;
    } catch (cause) {
      last = cause instanceof Error ? cause.message : String(cause);
    }
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 2_000));
  }

  throw new Error(
    `the public /mcp address did not answer 401 without a key within ${PUBLIC_DOOR_TIMEOUT_MS / 1_000} seconds (${last})`,
  );
}

export interface TunneledStackOptions {
  readonly env?: NodeJS.ProcessEnv;
  /** Adds the `[tunnel]` prefix in production; tests collect the bare lines. */
  readonly log?: (line: string) => void;
  readonly startLog?: (line: string) => void;
  readonly startError?: (line: string) => void;
  /** Called when a local service dies after the stack is ready. */
  readonly onUnexpectedExit?: (name: ServiceName, code: number | null, signal: NodeJS.Signals | null) => void;
}

export interface TunneledStack {
  readonly publicUrl: string;
  readonly mcpUrl: string;
  readonly publicBaseUrl: string;
  readonly publicBaseUrlSource: PublicBaseUrlSource;
  readonly stack: LabStack;
}

/**
 * Take the address cloudflared printed, then start the local services with it.
 * The gateway reads `LAB_PUBLIC_BASE_URL` once at startup, so the public
 * address has to exist first: a quick tunnel prints its address before the
 * local origin answers, so cloudflared goes first and the gateway second.
 * That keeps one source of truth and avoids restarting the gateway.
 * The caller owns `cloudflared` and stops it when this rejects.
 */
export async function startTunneledStack(
  cloudflared: ChildProcess,
  options: TunneledStackOptions = {},
): Promise<TunneledStack> {
  const env = options.env ?? process.env;
  const logLine = options.log ?? log;

  const publicUrl = await waitForPublicUrl(cloudflared);
  const mcpUrl = `${publicUrl}/mcp`;
  const choice = choosePublicBaseUrl(env[PUBLIC_BASE_URL_ENV], publicUrl);
  logLine(`public MCP address: ${mcpUrl}`);
  logLine(describePublicBaseUrl(choice));

  const stack = await startStack({
    env: { ...env, [PUBLIC_BASE_URL_ENV]: choice.baseUrl },
    includeConsole: false,
    ...(options.startLog === undefined ? {} : { log: options.startLog }),
    ...(options.startError === undefined ? {} : { error: options.startError }),
    ...(options.onUnexpectedExit === undefined ? {} : { onUnexpectedExit: options.onUnexpectedExit }),
  });

  return {
    publicUrl,
    mcpUrl,
    publicBaseUrl: choice.baseUrl,
    publicBaseUrlSource: choice.source,
    stack,
  };
}

async function main(): Promise<void> {
  const plan = planTunnel();
  await requireCloudflared(plan.cloudflaredPath);

  const startedAt = Date.now();
  const deadline = closeAt(startedAt, plan.minutes);

  let stack: LabStack | undefined;
  let cloudflared: ChildProcess | undefined;
  let timer: { cancel(): void } | undefined;
  let stopping = false;

  const stop = async (exitCode: number, reason: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    timer?.cancel();
    log(`stopping (${reason})`);
    // Close the public door first, then the local services behind it.
    await stopChild(cloudflared, STOP_TIMEOUT_MS);
    await stack?.stop();
    log('tunnel and lab services are stopped');
    process.exit(exitCode);
  };

  process.once('SIGINT', () => void stop(0, 'Ctrl+C'));
  process.once('SIGTERM', () => void stop(0, 'SIGTERM'));

  try {
    log(`cloudflared: ${plan.cloudflaredPath}`);
    log(`local gateway: ${plan.target}`);
    log(`operator console 127.0.0.1:${plan.consolePort} is not part of the tunnel`);
    log(`this session stops at ${formatClock(deadline)} (${plan.minutes} minutes)`);
    timer = armCloseAt(deadline, () => void stop(0, `${plan.minutes} minutes are up`));

    const child = spawn(plan.cloudflaredPath, [...plan.args], {
      cwd: labRoot,
      env: cloudflaredEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    cloudflared = child;
    child.on('exit', (code, signal) => {
      if (!stopping) void stop(1, `cloudflared exited (code=${String(code)}, signal=${String(signal)})`);
    });
    child.on('error', (cause) => {
      if (!stopping) void stop(1, `cloudflared failed: ${cause.message}`);
    });

    const session = await startTunneledStack(child, {
      env: process.env,
      onUnexpectedExit: (name) => void stop(1, `${name} stopped unexpectedly`),
    });
    stack = session.stack;
    log(`local stack ready at ${stack.gatewayUrl}`);
    log('add the MCP address as a Streamable HTTP skill; paste one person\'s key into the skill form, never into this terminal');
    log('this command never reads or prints a key');

    await waitForPublicDoor(session.mcpUrl);
    log('the public door answers 401 without a key, so the tunnel reaches the gateway');
    log(`press Ctrl+C to stop now; otherwise both stop at ${formatClock(deadline)}`);
  } catch (cause) {
    log(`failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    await stop(1, 'start failed');
  }
}

const isMainModule =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) await main();
