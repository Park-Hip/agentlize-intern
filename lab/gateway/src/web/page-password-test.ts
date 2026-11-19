import assert from 'node:assert/strict';
import test from 'node:test';
import { startFixture, type GatewayFixture } from '../fixture.js';

const HOA = 'NV-02';
const NAM = 'NV-05';

interface Browser {
  readonly cookie: string;
  readonly csrf: string;
}

function login(
  f: GatewayFixture,
  employeeId: string,
  password: string,
  next = '',
): Promise<{ response: Response; cookie: string }> {
  return fetch(`${f.gateway.url}/dang-nhap`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ employee: employeeId, password, next }).toString(),
  }).then(async (response) => {
    const setCookie = response.headers.get('set-cookie') ?? '';
    return { response, cookie: setCookie.split(';')[0] ?? '' };
  });
}

async function signIn(f: GatewayFixture, employeeId: string, proposalId: string): Promise<Browser> {
  const { response, cookie } = await login(f, employeeId, f.pagePasswordFor(employeeId), `/xac-nhan/${proposalId}`);
  assert.equal(response.status, 303);
  const card = await fetch(`${f.gateway.url}/xac-nhan/${proposalId}`, { headers: { cookie } });
  assert.equal(card.status, 200);
  const csrf = /name="csrf" value="([^"]+)"/.exec(await card.text())?.[1];
  assert.ok(csrf !== undefined, 'the card carries a CSRF token');
  return { cookie, csrf };
}

function press(f: GatewayFixture, proposalId: string, button: 'gui' | 'huy', browser: Browser): Promise<Response> {
  return fetch(`${f.gateway.url}/xac-nhan/${proposalId}/${button}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie: browser.cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf: browser.csrf }).toString(),
  });
}

async function propose(
  f: GatewayFixture,
  employeeId: string,
  changes: Record<string, string>,
  key = f.keyFor(employeeId),
): Promise<string> {
  const answer = await f.call('propose_task_change', { task_id: 'T-12', changes }, key);
  assert.equal(answer.status, 200, answer.body.text);
  const link = answer.body.text.split('\n').find((line) => /^http:\/\/127\.0\.0\.1:\d+\/xac-nhan\/dx-[0-9a-f]{16}$/.test(line));
  assert.ok(link !== undefined, `the answer has a confirmation link: ${answer.body.text}`);
  return link.slice(link.lastIndexOf('/') + 1);
}

test('page password: a tool key is refused at login, and a page password is refused at both tool doors', async () => {
  const f = await startFixture();
  try {
    const toolKey = await login(f, HOA, f.keyFor(HOA));
    assert.equal(toolKey.response.status, 401);
    assert.equal(toolKey.response.headers.get('set-cookie'), null);
    assert.match(await toolKey.response.text(), /Mật khẩu trang không đúng/);

    const wrongPerson = await login(f, HOA, f.pagePasswordFor(NAM));
    assert.equal(wrongPerson.response.status, 401);

    const pagePassword = f.pagePasswordFor(HOA);
    const ok = await login(f, HOA, pagePassword);
    assert.equal(ok.response.status, 200);
    assert.match(ok.response.headers.get('set-cookie') ?? '', /^lab_session=/);

    const toolDoor = await fetch(`${f.gateway.url}/v1/tools/get_task`, {
      method: 'POST',
      headers: { authorization: `Bearer ${pagePassword}`, 'content-type': 'application/json' },
      body: JSON.stringify({ task_id: 'T-12' }),
    });
    assert.equal(toolDoor.status, 401);
    assert.equal(((await toolDoor.json()) as { reason_code?: string }).reason_code, 'KEY_INVALID');

    const mcpDoor = await fetch(`${f.gateway.url}/mcp`, {
      method: 'POST',
      headers: { authorization: `Bearer ${pagePassword}`, 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    assert.equal(mcpDoor.status, 401);
    assert.match(((await mcpDoor.json()) as { error?: { message?: string } }).error?.message ?? '', /\[KEY_INVALID\]/);
  } finally {
    await f.close();
  }
});

test('page password: revoking the drafting key after the draft refuses Gửi with KEY_REVOKED and writes nothing', async () => {
  const f = await startFixture();
  try {
    const proposalId = await propose(f, HOA, { status: 'done' });
    const draftedByKeyId = f.gateway.proposals.get(proposalId)?.draftedByKeyId ?? '';
    assert.match(draftedByKeyId, /^key-/);
    const browser = await signIn(f, HOA, proposalId);

    assert.equal(f.gateway.keys.revoke(draftedByKeyId), true);
    const sent = await press(f, proposalId, 'gui', browser);
    assert.equal(sent.status, 401);
    assert.match(await sent.text(), /\[KEY_REVOKED\]/);
    assert.equal(f.gateway.proposals.get(proposalId)?.status, 'awaiting_confirmation');
    assert.equal(f.gateway.commands.findByProposal(proposalId), undefined);
    assert.equal(f.systems.writeCount('T-12'), 0);

    const line = f.gateway.trace.list().find((entry) => entry.tool === 'proposal_send');
    assert.equal(line?.outcome, 'refused');
    assert.equal(line?.reasonCode, 'KEY_REVOKED');
    assert.equal(line?.ruleId, 'WRITE.KEY_REVOKED');
  } finally {
    await f.close();
  }
});

test('page password: revoking the session password after login refuses Gửi, closes the session and writes nothing', async () => {
  const f = await startFixture();
  try {
    const proposalId = await propose(f, HOA, { status: 'done' });
    const browser = await signIn(f, HOA, proposalId);
    const passwordId = f.gateway.sessions.find(browser.cookie.slice('lab_session='.length))?.passwordId ?? '';
    assert.match(passwordId, /^pwd-/);

    assert.equal(f.gateway.pagePasswords.revoke(passwordId), true);
    const sent = await press(f, proposalId, 'gui', browser);
    assert.equal(sent.status, 401);
    assert.match(await sent.text(), /\[KEY_REVOKED\]/);
    assert.equal(f.gateway.sessions.find(browser.cookie.slice('lab_session='.length)), undefined);
    assert.equal(f.gateway.proposals.get(proposalId)?.status, 'awaiting_confirmation');
    assert.equal(f.gateway.commands.findByProposal(proposalId), undefined);
    assert.equal(f.systems.writeCount('T-12'), 0);

    const card = await fetch(`${f.gateway.url}/xac-nhan/${proposalId}`, { redirect: 'manual', headers: { cookie: browser.cookie } });
    assert.equal(card.status, 303);
    assert.equal(card.headers.get('location'), `/dang-nhap?next=${encodeURIComponent(`/xac-nhan/${proposalId}`)}`);
  } finally {
    await f.close();
  }
});

test('page password: a proposal keeps the key that drafted it, so the page checks the same key later', async () => {
  const f = await startFixture();
  try {
    const rawKey = f.keyFor(HOA);
    const proposalId = await propose(f, HOA, { status: 'done' }, rawKey);
    const proposal = f.gateway.proposals.get(proposalId);
    assert.equal(proposal?.draftedByKeyId, f.gateway.keys.findByRawKey(rawKey)?.keyId);
    assert.equal(proposal?.requester, HOA);
  } finally {
    await f.close();
  }
});
