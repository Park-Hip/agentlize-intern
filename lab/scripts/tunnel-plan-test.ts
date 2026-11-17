import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_TUNNEL_MINUTES,
  MAX_TUNNEL_MINUTES,
  armCloseAt,
  buildCloudflaredArgs,
  closeAt,
  cloudflaredEnv,
  formatClock,
  parseTunnelUrl,
  planTunnel,
  resolveCloudflaredPath,
  resolveConsolePort,
  resolveTunnelMinutes,
  WINDOWS_CLOUDFLARED_PATH,
  type TimerApi,
} from './tunnel-plan.js';

test('tunnel-plan: defaults keep the gateway on loopback and never touch the console port', () => {
  const plan = planTunnel({}, 'linux');

  assert.equal(plan.gatewayPort, 8790);
  assert.equal(plan.consolePort, 8793);
  assert.equal(plan.minutes, DEFAULT_TUNNEL_MINUTES);
  assert.equal(plan.target, 'http://127.0.0.1:8790');
  assert.equal(plan.cloudflaredPath, 'cloudflared');
  assert.deepEqual(plan.args, ['tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:8790']);

  assert.equal(planTunnel({}, 'win32').cloudflaredPath, WINDOWS_CLOUDFLARED_PATH);
});

test('tunnel-plan: the environment changes the port, the limit and the binary', () => {
  const plan = planTunnel(
    {
      LAB_GATEWAY_PORT: '8795',
      LAB_CONSOLE_PORT: '9000',
      LAB_TUNNEL_MINUTES: '30',
      LAB_CLOUDFLARED_PATH: 'D:\\tools\\cloudflared.exe',
    },
    'win32',
  );

  assert.equal(plan.gatewayPort, 8795);
  assert.equal(plan.consolePort, 9000);
  assert.equal(plan.minutes, 30);
  assert.equal(plan.target, 'http://127.0.0.1:8795');
  assert.equal(plan.cloudflaredPath, 'D:\\tools\\cloudflared.exe');
  assert.deepEqual(plan.args, ['tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:8795']);
});

test('tunnel-plan: the console port can never be the tunnel target', () => {
  assert.throws(() => planTunnel({ LAB_GATEWAY_PORT: '8793' }, 'linux'), /never goes through the tunnel/);
  assert.throws(
    () => planTunnel({ LAB_GATEWAY_PORT: '9000', LAB_CONSOLE_PORT: '9000' }, 'linux'),
    /never goes through the tunnel/,
  );
  assert.throws(() => resolveConsolePort({ LAB_CONSOLE_PORT: 'hello' }), /LAB_CONSOLE_PORT/);
});

test('tunnel-plan: the limit is a whole number from 1 to 45 minutes', () => {
  assert.equal(resolveTunnelMinutes(undefined), 45);
  assert.equal(resolveTunnelMinutes(''), 45);
  assert.equal(resolveTunnelMinutes('1'), 1);
  assert.equal(resolveTunnelMinutes('45'), MAX_TUNNEL_MINUTES);
  assert.throws(() => resolveTunnelMinutes('0'), /LAB_TUNNEL_MINUTES/);
  assert.throws(() => resolveTunnelMinutes('46'), /LAB_TUNNEL_MINUTES/);
  assert.throws(() => resolveTunnelMinutes('1.5'), /LAB_TUNNEL_MINUTES/);
  assert.throws(() => resolveTunnelMinutes('soon'), /LAB_TUNNEL_MINUTES/);
});

test('tunnel-plan: only the gateway loopback address is built into the cloudflared command', () => {
  assert.deepEqual(buildCloudflaredArgs(8790), ['tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:8790']);
  assert.throws(() => buildCloudflaredArgs(0), /gateway port/);
  assert.throws(() => buildCloudflaredArgs(65_536), /gateway port/);
});

test('tunnel-plan: cloudflared never inherits a lab key', () => {
  const env = cloudflaredEnv({
    PATH: 'C:\\Windows',
    LAB_SERVICE_KEY: 'service-secret',
    LAB_USER_KEY: 'probe-secret',
    HOME: 'C:\\Users\\lab',
  });

  assert.deepEqual(env, { PATH: 'C:\\Windows', HOME: 'C:\\Users\\lab' });
});

test('tunnel-plan: a quick tunnel address is read from cloudflared output', () => {
  assert.equal(
    parseTunnelUrl('2026-11-17T21:30:00Z INF |  https://brave-cat-123.trycloudflare.com  |'),
    'https://brave-cat-123.trycloudflare.com',
  );
  assert.equal(parseTunnelUrl('https://quiet-lab.trycloudflare.com/mcp'), 'https://quiet-lab.trycloudflare.com');
  assert.equal(parseTunnelUrl('http://brave-cat-123.trycloudflare.com'), null);
  assert.equal(parseTunnelUrl('https://brave-cat-123.example.com'), null);
  assert.equal(parseTunnelUrl('no address here'), null);
});

test('tunnel-plan: the default cloudflared path follows the platform', () => {
  assert.equal(resolveCloudflaredPath({}, 'linux'), 'cloudflared');
  assert.equal(resolveCloudflaredPath({}, 'darwin'), 'cloudflared');
  assert.equal(resolveCloudflaredPath({}, 'win32'), WINDOWS_CLOUDFLARED_PATH);
  assert.equal(resolveCloudflaredPath({ LAB_CLOUDFLARED_PATH: ' /opt/bin/cloudflared ' }, 'win32'), '/opt/bin/cloudflared');
});

test('tunnel-plan: a session closes exactly 45 minutes after it opens', () => {
  const startedAt = 1_700_000_000_000;
  assert.equal(closeAt(startedAt, 45), startedAt + 45 * 60_000);
  assert.equal(closeAt(startedAt, 1), startedAt + 60_000);
  assert.throws(() => closeAt(startedAt, 0), /between 1 and 45/);
  assert.throws(() => closeAt(startedAt, 46), /between 1 and 45/);
  assert.match(formatClock(startedAt), /^\d{1,2}:\d{2}$/);
});

test('tunnel-plan: the shutdown timer waits the remaining time and can be cancelled', () => {
  let callback: (() => void) | null = null;
  let delayMs = -1;
  let cleared: unknown = null;
  let fired = 0;

  const api: TimerApi = {
    now: () => 10_000,
    set: (next, delay) => {
      callback = next;
      delayMs = delay;
      return 'timer-1';
    },
    clear: (handle) => {
      cleared = handle;
    },
  };

  const deadline = closeAt(10_000, 45);
  const timer = armCloseAt(deadline, () => {
    fired += 1;
  }, api);

  assert.equal(delayMs, 45 * 60_000);
  assert.equal(cleared, null);
  assert.notEqual(callback, null);

  const fire = callback as unknown as () => void;
  fire();
  assert.equal(fired, 1);

  timer.cancel();
  assert.equal(cleared, 'timer-1');
});

test('tunnel-plan: a deadline already in the past fires immediately', () => {
  let delayMs = -1;
  const api: TimerApi = {
    now: () => 20_000,
    set: (_callback, delay) => {
      delayMs = delay;
      return null;
    },
    clear: () => undefined,
  };

  armCloseAt(10_000, () => undefined, api);
  assert.equal(delayMs, 0);
});
