import { LOOPBACK_HOST, PORT_ENV, SERVICE_KEY_ENV, resolvePort } from '@lab/shared';

/** The public session never lasts longer than this, per ADR-0004. */
export const DEFAULT_TUNNEL_MINUTES = 45;
export const MAX_TUNNEL_MINUTES = 45;
export const MIN_TUNNEL_MINUTES = 1;

export const TUNNEL_MINUTES_ENV = 'LAB_TUNNEL_MINUTES';
export const CLOUDFLARED_PATH_ENV = 'LAB_CLOUDFLARED_PATH';
export const CONSOLE_PORT_ENV = 'LAB_CONSOLE_PORT';

/** The probe key variable; cloudflared never needs it. */
const USER_KEY_ENV = 'LAB_USER_KEY';

/** ADR-0006: the operator console listens here and must never reach the tunnel. */
export const DEFAULT_CONSOLE_PORT = 8793;

/** The default install path on the lab machine. Override it with `LAB_CLOUDFLARED_PATH`. */
export const WINDOWS_CLOUDFLARED_PATH = 'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe';

/** A Cloudflare quick tunnel host. Named tunnels on a custom domain are not used here. */
const QUICK_TUNNEL_URL = /https:\/\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.trycloudflare\.com/i;

function wholeNumber(raw: string | undefined, name: string, min: number, max: number, fallback: number): number {
  const value = raw?.trim();
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be a whole number between ${min} and ${max}, got "${value}"`);
  }
  return parsed;
}

/** The 45 minute limit can be shortened for a demo, never lengthened. */
export function resolveTunnelMinutes(raw: string | undefined): number {
  return wholeNumber(raw, TUNNEL_MINUTES_ENV, MIN_TUNNEL_MINUTES, MAX_TUNNEL_MINUTES, DEFAULT_TUNNEL_MINUTES);
}

/** The console port is read here only to keep the tunnel away from it (ADR-0006). */
export function resolveConsolePort(env: NodeJS.ProcessEnv = process.env): number {
  return wholeNumber(env[CONSOLE_PORT_ENV], CONSOLE_PORT_ENV, 1, 65_535, DEFAULT_CONSOLE_PORT);
}

/** `cloudflared` from `PATH` outside Windows; the lab machine keeps it under Program Files. */
export function resolveCloudflaredPath(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string {
  const configured = env[CLOUDFLARED_PATH_ENV]?.trim();
  if (configured !== undefined && configured !== '') return configured;
  return platform === 'win32' ? WINDOWS_CLOUDFLARED_PATH : 'cloudflared';
}

/** The one local service that may go through the tunnel. */
export function buildTunnelTarget(gatewayPort: number): string {
  if (!Number.isInteger(gatewayPort) || gatewayPort < 1 || gatewayPort > 65_535) {
    throw new Error(`gateway port must be a whole number between 1 and 65535, got "${String(gatewayPort)}"`);
  }
  return `http://${LOOPBACK_HOST}:${gatewayPort}`;
}

export function assertConsoleIsSeparate(gatewayPort: number, consolePort: number): void {
  if (gatewayPort === consolePort) {
    throw new Error(
      `${PORT_ENV.gateway} must differ from ${CONSOLE_PORT_ENV} (${consolePort}): ` +
        'the operator console never goes through the tunnel',
    );
  }
}

/** A quick tunnel forwards one local address; the console and the two fake systems stay off it. */
export function buildCloudflaredArgs(gatewayPort: number): readonly string[] {
  return ['tunnel', '--no-autoupdate', '--url', buildTunnelTarget(gatewayPort)];
}

export interface TunnelPlan {
  readonly gatewayPort: number;
  readonly consolePort: number;
  readonly minutes: number;
  readonly target: string;
  readonly cloudflaredPath: string;
  readonly args: readonly string[];
}

/** Everything the tunnel command needs, resolved from the environment without touching the network. */
export function planTunnel(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): TunnelPlan {
  const gatewayPort = resolvePort('gateway', env);
  const consolePort = resolveConsolePort(env);
  assertConsoleIsSeparate(gatewayPort, consolePort);
  return {
    gatewayPort,
    consolePort,
    minutes: resolveTunnelMinutes(env[TUNNEL_MINUTES_ENV]),
    target: buildTunnelTarget(gatewayPort),
    cloudflaredPath: resolveCloudflaredPath(env, platform),
    args: buildCloudflaredArgs(gatewayPort),
  };
}

/**
 * The environment cloudflared runs with. It keeps the machine settings it needs
 * but never sees a lab key, so a crash dump or a log cannot carry one.
 */
export function cloudflaredEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const copy: NodeJS.ProcessEnv = { ...env };
  delete copy[SERVICE_KEY_ENV];
  delete copy[USER_KEY_ENV];
  return copy;
}

/** The first quick tunnel address in one line of cloudflared output, or null. */
export function parseTunnelUrl(line: string): string | null {
  return QUICK_TUNNEL_URL.exec(line)?.[0] ?? null;
}

export interface TimerApi {
  readonly now: () => number;
  set(callback: () => void, delayMs: number): unknown;
  clear(handle: unknown): void;
}

export const systemTimer: TimerApi = {
  now: () => Date.now(),
  set: (callback, delayMs) => setTimeout(callback, delayMs),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** When a session opened at `startedAt` has to close. */
export function closeAt(startedAt: number, minutes: number): number {
  if (!Number.isInteger(minutes) || minutes < MIN_TUNNEL_MINUTES || minutes > MAX_TUNNEL_MINUTES) {
    throw new Error(`minutes must be a whole number between ${MIN_TUNNEL_MINUTES} and ${MAX_TUNNEL_MINUTES}`);
  }
  return startedAt + minutes * 60_000;
}

/** Fire `onClose` at a fixed deadline. The returned handle cancels it. */
export function armCloseAt(deadline: number, onClose: () => void, api: TimerApi = systemTimer): { cancel(): void } {
  const handle = api.set(onClose, Math.max(0, deadline - api.now()));
  return { cancel: () => api.clear(handle) };
}

/** The local clock time a session closes, for the operator to write down. */
export function formatClock(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
}
