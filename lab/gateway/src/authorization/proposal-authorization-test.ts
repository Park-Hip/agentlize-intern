import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { GATEWAY_DB_FILE } from '../database.js';
import { startFixture, type GatewayFixture } from '../fixture.js';
import { WEB_DOOR, type AuthorizationResolver } from '../authorization/index.js';
import type { ProposalExecutor } from '../proposals/index.js';
import { Outbox } from '../writes/index.js';

const HOA = 'NV-02';
const QUANG = 'NV-01';
const THIRTY = Array.from({ length: 30 }, (_, index) => `T-${100 + index}`);

interface Browser {
  readonly cookie: string;
  readonly csrf: string;
}

/** A provider that answers for a grant without any OAuth server. */
class FakeGrantResolver implements AuthorizationResolver {
  readonly kind = 'oauth' as const;
  readonly revoked = new Set<string>();
  readonly expired = new Set<string>();
  /** A clock that ran out for the short access token, not for the grant behind it. */
  tokenExpired = true;

  resolve(ref: Parameters<AuthorizationResolver['resolve']>[0]) {
    if (ref.kind !== 'oauth') return { ok: false as const, reason: 'AUTHORIZATION_UNKNOWN' as const };
    if (this.revoked.has(ref.id)) return { ok: false as const, reason: 'AUTHORIZATION_REVOKED' as const };
    if (this.expired.has(ref.id)) return { ok: false as const, reason: 'AUTHORIZATION_EXPIRED' as const };
    return {
      ok: true as const,
      grant: {
        ref,
        employeeId: HOA,
        caller: 'test' as const,
        scope: 'full' as const,
        expiresAt: null,
        status: 'active' as const,
      },
    };
  }
}

const quiet: ProposalExecutor = { execute: () => Promise.resolve({ state: 'received' }) };

function linkOf(text: string): string {
  const link = text
    .split('\n')
    .find((line) => /^http:\/\/127\.0\.0\.1:\d+\/xac-nhan\/dx-[0-9a-f]{16}$/.test(line));
  assert.ok(link !== undefined, `the answer has a confirmation link: ${text}`);
  return link.slice(link.lastIndexOf('/') + 1);
}

async function login(f: GatewayFixture, employeeId: string, next: string): Promise<string> {
  const response = await fetch(`${f.gateway.url}/dang-nhap`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ employee: employeeId, password: f.pagePasswordFor(employeeId), next }).toString(),
  });
  assert.equal(response.status, 303);
  return (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
}

async function signIn(f: GatewayFixture, employeeId: string, proposalId: string, page: 'card' | 'approval' = 'card'): Promise<Browser> {
  const path = page === 'card' ? `/xac-nhan/${proposalId}` : `/duyet/${proposalId}`;
  const cookie = await login(f, employeeId, path);
  const response = await fetch(`${f.gateway.url}${path}`, { redirect: 'manual', headers: { cookie } });
  assert.equal(response.status, 200);
  const csrf = /name="csrf" value="([^"]+)"/.exec(await response.text())?.[1];
  assert.ok(csrf !== undefined, 'the page carries a CSRF token');
  return { cookie, csrf };
}

function press(
  f: GatewayFixture,
  proposalId: string,
  button: 'gui' | 'duyet',
  browser: Browser,
): Promise<Response> {
  const path = button === 'gui' ? `/xac-nhan/${proposalId}/gui` : `/duyet/${proposalId}/duyet`;
  return fetch(`${f.gateway.url}${path}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie: browser.cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf: browser.csrf }).toString(),
  });
}

async function draft(f: GatewayFixture, taskIds: readonly string[]): Promise<string> {
  const answer = await f.call(
    'propose_task_change',
    { task_ids: taskIds, changes: { assignee: 'NV-04' } },
    f.keyFor(HOA),
  );
  assert.equal(answer.status, 200, answer.body.text);
  return linkOf(answer.body.text);
}

/** Point one stored proposal at a grant, the way an OAuth-drafted proposal would hold it. */
function moveToGrant(f: GatewayFixture, proposalId: string, grantId: string): void {
  const db = new Database(join(f.dir, GATEWAY_DB_FILE));
  try {
    db.prepare("UPDATE proposals SET authorization_kind = 'oauth', authorization_id = ? WHERE proposal_id = ?").run(
      grantId,
      proposalId,
    );
  } finally {
    db.close();
  }
}

test('authorization: an active grant confirms a proposal, with no lab_ key behind the token', async () => {
  const f = await startFixture({ executor: quiet });
  try {
    const grants = new FakeGrantResolver();
    f.gateway.authorization.register(grants);

    const id = await draft(f, ['T-12']);
    moveToGrant(f, id, 'grant-hoa');
    const browser = await signIn(f, HOA, id);
    const sent = await press(f, id, 'gui', browser);

    assert.equal(sent.status, 303, await sent.text());
    assert.equal(f.gateway.proposals.get(id)?.status, 'confirmed');
    // The token is marked expired, but the grant still stands: the two clocks are separate.
    assert.equal(grants.tokenExpired, true);
    assert.equal(f.systems.writeCount('T-12'), 0, 'the quiet executor sends nothing');
    assert.equal(f.gateway.commands.listByProposal(id).length, 1, 'a command exists from the confirmation');
  } finally {
    await f.close();
  }
});

test('authorization: a revoked grant blocks Gửi and leaves the proposal open', async () => {
  const f = await startFixture({ executor: quiet });
  try {
    const grants = new FakeGrantResolver();
    f.gateway.authorization.register(grants);

    const id = await draft(f, ['T-12']);
    moveToGrant(f, id, 'grant-hoa');
    grants.revoked.add('grant-hoa');

    const browser = await signIn(f, HOA, id);
    const sent = await press(f, id, 'gui', browser);

    assert.equal(sent.status, 401);
    assert.match(await sent.text(), /\[KEY_REVOKED\]/);
    assert.equal(f.gateway.proposals.get(id)?.status, 'awaiting_confirmation');
    assert.equal(f.gateway.commands.findByProposal(id), undefined);
    const line = f.gateway.trace.list().find((entry) => entry.tool === 'proposal_send');
    assert.equal(line?.reasonCode, 'KEY_REVOKED');
    assert.equal(line?.ruleId, 'WRITE.KEY_REVOKED');
  } finally {
    await f.close();
  }
});

test('authorization: a grant revoked after Gửi also blocks the lead approval and creates no command', async () => {
  const f = await startFixture({ executor: quiet });
  try {
    const grants = new FakeGrantResolver();
    f.gateway.authorization.register(grants);

    const id = await draft(f, THIRTY);
    moveToGrant(f, id, 'grant-hoa');
    const send = await press(f, id, 'gui', await signIn(f, HOA, id));
    assert.equal(send.status, 303, await send.text());
    assert.equal(f.gateway.proposals.get(id)?.status, 'awaiting_approval');

    grants.revoked.add('grant-hoa');
    const approve = await press(f, id, 'duyet', await signIn(f, QUANG, id, 'approval'));
    assert.equal(approve.status, 401);
    assert.match(await approve.text(), /\[KEY_REVOKED\]/);
    assert.equal(f.gateway.proposals.get(id)?.status, 'awaiting_approval');
    assert.equal(f.gateway.commands.findByProposal(id), undefined);
  } finally {
    await f.close();
  }
});

test('authorization: a fresh grant for the same person does not resurrect an old proposal', async () => {
  const f = await startFixture({ executor: quiet });
  try {
    const grants = new FakeGrantResolver();
    f.gateway.authorization.register(grants);

    const id = await draft(f, ['T-12']);
    moveToGrant(f, id, 'grant-old');
    grants.revoked.add('grant-old');
    // A new connection resolves for the same person under a new grant id.
    assert.equal(f.gateway.authorization.resolve({ kind: 'oauth', id: 'grant-new' }, WEB_DOOR).ok, true);

    const sent = await press(f, id, 'gui', await signIn(f, HOA, id));
    assert.equal(sent.status, 401);
    assert.match(await sent.text(), /\[KEY_REVOKED\]/);
    assert.equal(f.gateway.proposals.get(id)?.status, 'awaiting_confirmation');
    assert.equal(f.gateway.commands.findByProposal(id), undefined, 'the old proposal still points at the old grant');
  } finally {
    await f.close();
  }
});

test('authorization: an expired grant is refused as such, never as a revocation', async () => {
  const f = await startFixture({ executor: quiet });
  try {
    const grants = new FakeGrantResolver();
    f.gateway.authorization.register(grants);

    const id = await draft(f, ['T-12']);
    moveToGrant(f, id, 'grant-hoa');
    grants.expired.add('grant-hoa');

    const sent = await press(f, id, 'gui', await signIn(f, HOA, id));
    assert.equal(sent.status, 401);
    assert.match(await sent.text(), /\[KEY_INVALID\]/);
    const line = f.gateway.trace.list().find((entry) => entry.tool === 'proposal_send');
    assert.equal(line?.ruleId, 'WRITE.AUTHORIZATION_EXPIRED');
    assert.equal(f.gateway.proposals.get(id)?.status, 'awaiting_confirmation');
  } finally {
    await f.close();
  }
});

test('outbox: a revoked source stops unsent commands and never rewrites a sent_unknown one', async () => {
  const f = await startFixture({ executor: quiet });
  try {
    const firstKey = f.keyFor(HOA);
    const draftWith = async (key: string): Promise<string> => {
      const answer = await f.call('propose_task_change', { task_ids: ['T-12'], changes: { assignee: 'NV-04' } }, key);
      assert.equal(answer.status, 200, answer.body.text);
      const id = linkOf(answer.body.text);
      assert.equal((await press(f, id, 'gui', await signIn(f, HOA, id))).status, 303);
      return id;
    };

    const revokeRaw = (rawKey: string): void => {
      const keyId = f.gateway.keys.findByRawKey(rawKey)?.keyId;
      assert.ok(keyId !== undefined);
      assert.equal(f.gateway.keys.revoke(keyId), true);
    };

    // A command no one has sent stays not_sent when its key is revoked.
    const unsent = await draftWith(firstKey);
    revokeRaw(firstKey);
    const unsentCommand = f.gateway.commands.findByProposal(unsent);
    assert.ok(unsentCommand !== undefined);
    assert.equal(unsentCommand.status, 'not_sent');

    // A command whose answer was lost stays sent_unknown; the evidence is not deleted or called failed.
    const secondKey = f.keyFor(HOA);
    const unknown = await draftWith(secondKey);
    const unknownCommand = f.gateway.commands.findByProposal(unknown);
    assert.ok(unknownCommand !== undefined);
    f.gateway.commands.markSent(unknownCommand.commandId);
    revokeRaw(secondKey);

    const outbox = new Outbox({
      commands: f.gateway.commands,
      proposals: f.gateway.proposals,
      adapters: f.systems.adapters,
      trace: f.gateway.trace,
      authorization: f.gateway.authorization,
      log: () => undefined,
    });
    outbox.start();
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 100));
    await outbox.close();

    assert.equal(f.gateway.commands.findByProposal(unsent)?.status, 'not_sent');
    assert.equal(f.gateway.commands.findByProposal(unsent)?.attempts, 0);
    assert.equal(f.gateway.commands.findByProposal(unknown)?.status, 'sent_unknown');
    assert.equal(f.gateway.commands.findByProposal(unknown)?.attempts, 1);
    assert.equal(f.systems.writeCount('T-12'), 0);

    // A live key is still sent by the same loop, so the gate blocks only a dead source.
    const liveKey = f.keyFor(HOA);
    const live = await draftWith(liveKey);
    const again = new Outbox({
      commands: f.gateway.commands,
      proposals: f.gateway.proposals,
      adapters: f.systems.adapters,
      trace: f.gateway.trace,
      authorization: f.gateway.authorization,
      log: () => undefined,
    });
    again.start();
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline && f.gateway.commands.findByProposal(live)?.status !== 'done') {
      await new Promise((resolveSleep) => setTimeout(resolveSleep, 20));
    }
    await again.close();
    assert.equal(f.gateway.commands.findByProposal(live)?.status, 'done');
    assert.equal(f.systems.writeCount('T-12'), 1);
  } finally {
    await f.close();
  }
});
