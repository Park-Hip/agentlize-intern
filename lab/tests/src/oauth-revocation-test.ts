import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { type TestContext } from 'node:test';
import Database from 'better-sqlite3';
import { DATA_DIR_ENV, PORT_ENV, RULES_PATH_ENV, SERVICE_KEY_ENV } from '@lab/shared';
import { keyOf, pagePasswordOf, runCli } from './cli.js';
import { freePorts, labRoot, spawnBuiltService, stopChild, waitForHealth, type SpawnedService } from './process.js';

const HOA = 'NV-02';
const NAM = 'NV-05';
const DEFAULT_RULES = join(labRoot, 'gateway', 'policy', 'rules.json');

interface Lab {
  readonly base: string;
  readonly dataDir: string;
  readonly env: NodeJS.ProcessEnv;
  readonly gatewayPort: number;
  readonly serviceKey: string;
  readonly hoaKey: string;
  readonly hoaPagePassword: string;
  readonly namPagePassword: string;
  track(service: SpawnedService): SpawnedService;
}

/**
 * Start the real gateway as a separate process on free ports with the two fake
 * systems behind it, plus one key and one page password per character. This is
 * the same wiring `npm start` uses, so the connection page and the write path
 * are exercised exactly as a person meets them.
 */
async function startLab(t: TestContext): Promise<Lab> {
  const serviceKey = randomBytes(32).toString('base64url');
  const dataDir = await mkdtemp(join(tmpdir(), 'agentlize-lab-oauth-revoke-'));
  const [directoryPort, tasksPort, gatewayPort] = await freePorts(3);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    [SERVICE_KEY_ENV]: serviceKey,
    [DATA_DIR_ENV]: dataDir,
    [RULES_PATH_ENV]: DEFAULT_RULES,
    [PORT_ENV.directory]: String(directoryPort),
    [PORT_ENV.tasks]: String(tasksPort),
    [PORT_ENV.gateway]: String(gatewayPort),
  };

  const started: SpawnedService[] = [];
  const track = (service: SpawnedService): SpawnedService => {
    started.push(service);
    return service;
  };

  t.after(async () => {
    for (const service of [...started].reverse()) await stopChild(service.child);
    await rm(dataDir, { recursive: true, force: true });
  });

  const directory = track(spawnBuiltService('fake-directory', env));
  const tasks = track(spawnBuiltService('fake-tasks', env));
  await waitForHealth(directory, directoryPort ?? 0, serviceKey);
  await waitForHealth(tasks, tasksPort ?? 0, serviceKey);

  const gateway = track(spawnBuiltService('gateway', env));
  await waitForHealth(gateway, gatewayPort ?? 0, serviceKey);

  const keys = runCli('seed-keys-main.js', [], env);

  return {
    base: `http://127.0.0.1:${gatewayPort}`,
    dataDir,
    env,
    gatewayPort: gatewayPort ?? 0,
    serviceKey,
    hoaKey: keyOf(keys, 'hoa').key,
    hoaPagePassword: pagePasswordOf(keys, 'hoa').password,
    namPagePassword: pagePasswordOf(keys, 'nam').password,
    track,
  };
}

interface Page {
  readonly cookie: string;
  readonly csrf: string;
}

/** Sign in with a page password and open one page, keeping its cookie and CSRF token. */
async function signIn(lab: Lab, employee: string, password: string, next: string): Promise<Page> {
  const response = await fetch(`${lab.base}/dang-nhap`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ employee, password, next }).toString(),
  });
  assert.equal(response.status, 303, await response.text());
  const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  const page = await fetch(`${lab.base}${next}`, { headers: { cookie } });
  const html = await page.text();
  assert.equal(page.status, 200, html);
  const csrf = /name="csrf" value="([^"]+)"/.exec(html)?.[1] ?? '';
  return { cookie, csrf };
}

function press(lab: Lab, path: string, page: Page, form: Record<string, string> = {}): Promise<Response> {
  return fetch(`${lab.base}${path}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie: page.cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf: page.csrf, ...form }).toString(),
  });
}

async function propose(lab: Lab, key: string, changes: Record<string, string>, task = 'T-12'): Promise<string> {
  const answer = await fetch(`${lab.base}/v1/tools/propose_task_change`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ task_ids: [task], changes }),
  });
  const body = (await answer.json()) as { text: string; reason_code: string | null };
  assert.equal(answer.status, 200, body.text);
  assert.equal(body.reason_code, null, body.text);
  const link = body.text.split('\n').find((line) => /\/xac-nhan\/dx-[0-9a-f]{16}$/.test(line));
  assert.ok(link !== undefined, `the answer carries a confirmation link: ${body.text}`);
  return link.slice(link.lastIndexOf('/') + 1);
}

test('oauth revocation journey: the connections page is scoped to its person, and says so when the list is empty', async (t) => {
  const lab = await startLab(t);
  const hoa = await signIn(lab, HOA, lab.hoaPagePassword, '/ket-noi');
  const nam = await signIn(lab, NAM, lab.namPagePassword, '/ket-noi');

  // Both pages render even with no grants: an empty list is an answer, not an error.
  for (const page of [hoa, nam]) {
    const response = await fetch(`${lab.base}/ket-noi`, { headers: { cookie: page.cookie } });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Kết nối ứng dụng/);
    assert.match(html, /Bạn chưa kết nối ứng dụng nào/);
    assert.doesNotMatch(html, /access_token|code_verifier|client_secret|trang_|lab_/, 'no secret on the page');
  }

  // An empty list still carries no form, so a press from it has no CSRF token and is refused.
  // A grant id that belongs to no one is then a 404 once the token is right; the grant-store test covers that path.
  const missing = await press(lab, '/ket-noi/grant-does-not-exist/ngat', hoa);
  assert.equal(missing.status, 403);
  assert.match(await missing.text(), /\[NOT_PERMITTED\]/, 'a press without a form token is refused');
});

test('oauth revocation journey: the connections page needs a session, and a press from another origin is refused', async (t) => {
  const lab = await startLab(t);

  // No session: the list redirects to login and the press is refused.
  const list = await fetch(`${lab.base}/ket-noi`, { redirect: 'manual' });
  assert.equal(list.status, 303);
  assert.match(list.headers.get('location') ?? '', /\/dang-nhap/);

  const noSession = await fetch(`${lab.base}/ket-noi/any/ngat`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf: 'x' }).toString(),
  });
  assert.equal(noSession.status, 401);
  assert.match(await noSession.text(), /\[NOT_PERMITTED\]/);

  // A signed-in press whose Origin is another site is refused before the CSRF check.
  const page = await signIn(lab, HOA, lab.hoaPagePassword, '/ket-noi');
  const foreign = await fetch(`${lab.base}/ket-noi/grant-x/ngat`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      cookie: page.cookie,
      'content-type': 'application/x-www-form-urlencoded',
      origin: 'https://evil.example',
    },
    body: new URLSearchParams({ csrf: page.csrf }).toString(),
  });
  assert.equal(foreign.status, 403);
  assert.match(await foreign.text(), /\[NOT_PERMITTED\]/);
});

test('oauth revocation journey: a grant id with HTML characters in the store is escaped on the page and reachable by its encoded press', async (t) => {
  const lab = await startLab(t);
  // Plant a grant whose id carries markup, as a hostile store could hold it.
  const hostileId = 'g"<script>alert(1)</script>/../x';
  const db = new Database(join(lab.dataDir, 'gateway.sqlite'));
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS oauth_grants (
      grant_id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, client_id TEXT NOT NULL, scope TEXT NOT NULL,
      created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT)`.replace(/\n\s+/g, ' '));
    db.prepare(
      `INSERT INTO oauth_grants (grant_id, employee_id, client_id, scope, created_at, expires_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`,
    ).run(hostileId, HOA, 'lab-demo-a', 'openid mcp:read', new Date().toISOString(), new Date(Date.now() + 3_600_000).toISOString());
  } finally {
    db.close();
  }

  const page = await signIn(lab, HOA, lab.hoaPagePassword, '/ket-noi');
  const list = await fetch(`${lab.base}/ket-noi`, { headers: { cookie: page.cookie } });
  const html = await list.text();
  assert.equal(list.status, 200);
  assert.doesNotMatch(html, /<script>/, 'the planted script tag is escaped, never executed');
  assert.match(html, /&lt;script&gt;/, 'the id is shown as escaped text');

  // The form action carries the whole id, percent-encoded, so a press can reach the exact grant.
  const action = /action="\/ket-noi\/([^"]+)\/ngat"/.exec(html)?.[1] ?? '';
  assert.notEqual(action, '', 'the hostile grant still has a disconnect form');
  assert.ok(!action.includes('<') && !action.includes('/../'), 'the encoded action carries no raw markup or path climb');
  assert.equal(decodeURIComponent(action), hostileId, 'the encoded segment decodes to the exact stored id');

  const pressed = await fetch(`${lab.base}/ket-noi/${action}/ngat`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie: page.cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf: page.csrf }).toString(),
  });
  assert.equal(pressed.status, 303, await pressed.text());

  const after = await fetch(`${lab.base}/ket-noi`, { headers: { cookie: page.cookie } });
  assert.match(await after.text(), /Đã ngắt/, 'the planted grant is now revoked, so the encoded press named it exactly');
});

test('oauth revocation journey: a key-drafted proposal still sends, so the new boundary left the old path alone', async (t) => {
  const lab = await startLab(t);
  const id = await propose(lab, lab.hoaKey, { assignee: 'NV-04' });
  const page = await signIn(lab, HOA, lab.hoaPagePassword, `/xac-nhan/${id}`);
  const sent = await press(lab, `/xac-nhan/${id}/gui`, page);
  assert.equal(sent.status, 303, await sent.text());

  const deadline = Date.now() + 15_000;
  let text = '';
  while (Date.now() < deadline) {
    const status = await fetch(`${lab.base}/v1/tools/get_request_status`, {
      method: 'POST',
      headers: { authorization: `Bearer ${lab.hoaKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ request_id: id }),
    });
    text = ((await status.json()) as { text: string }).text;
    if (text.includes('đã ghi thay đổi vào task T-12')) break;
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 100));
  }
  assert.match(text, /đã ghi thay đổi vào task T-12/, 'the key path still writes exactly once');
});
