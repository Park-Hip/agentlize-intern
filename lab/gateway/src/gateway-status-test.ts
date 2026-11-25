import assert from 'node:assert/strict';
import test from 'node:test';
import { GATEWAY_STATUSES } from '@lab/shared';
import { startFixture } from './fixture.js';
import { COMMAND_STATUSES } from './writes/index.js';
import { PROPOSAL_STATUSES } from './proposals/index.js';
import {
  GATEWAY_STATUS_BY_COMMAND_STATUS,
  GATEWAY_STATUS_BY_PROPOSAL_STATUS,
  gatewayStatusOf,
} from './tools/gateway-status.js';

const HOA = 'NV-02';

test('gateway status: every internal proposal and command status has exactly one gateway name', () => {
  // The lists are compared by value, so a new internal status fails here even
  // if its record happens to type-check.
  assert.deepEqual(Object.keys(GATEWAY_STATUS_BY_PROPOSAL_STATUS).sort(), [...PROPOSAL_STATUSES].sort());
  assert.deepEqual(Object.keys(GATEWAY_STATUS_BY_COMMAND_STATUS).sort(), [...COMMAND_STATUSES].sort());
  assert.deepEqual(GATEWAY_STATUS_BY_PROPOSAL_STATUS, {
    awaiting_confirmation: 'pending',
    awaiting_approval: 'pending',
    confirmed: 'executing',
    cancelled: 'cancelled',
    rejected: 'rejected',
    expired: 'expired',
  });

  for (const status of PROPOSAL_STATUSES) {
    const name = GATEWAY_STATUS_BY_PROPOSAL_STATUS[status];
    assert.ok((GATEWAY_STATUSES as readonly string[]).includes(name), `${status} needs a known gateway name`);
    if (status !== 'confirmed') assert.equal(gatewayStatusOf(status, []), name);
  }
  for (const status of COMMAND_STATUSES) {
    assert.equal(
      gatewayStatusOf('confirmed', [status]),
      GATEWAY_STATUS_BY_COMMAND_STATUS[status],
      `command status ${status} decides the proposal`,
    );
  }

  assert.equal(gatewayStatusOf('confirmed', []), 'executing', 'a confirmed proposal without commands is queued');
  assert.equal(gatewayStatusOf('confirmed', ['done', 'sent_unknown']), 'executing');
  assert.equal(gatewayStatusOf('confirmed', ['done', 'done']), 'executed');
  assert.equal(gatewayStatusOf('confirmed', ['done', 'failed']), 'failed', 'a partial write is not a success');
});

test('gateway status: action_status answers exactly like get_request_status, and a waiting draft is pending', async () => {
  const f = await startFixture();
  try {
    const key = f.keyFor(HOA);
    const drafted = await f.call('propose_task_change', { task_ids: ['T-12'], changes: { status: 'done' } }, key);
    assert.equal(drafted.status, 200, drafted.body.text);
    const id = /xac-nhan\/(dx-[0-9a-f]{16})/.exec(drafted.body.text)?.[1];
    assert.ok(id !== undefined, 'the answer carries the proposal code');

    const direct = await f.call('get_request_status', { request_id: id }, key);
    const alias = await f.call('action_status', { request_id: id }, key);
    assert.equal(direct.body.gateway_status, 'pending');
    assert.equal(alias.body.gateway_status, direct.body.gateway_status);
    assert.equal(alias.body.reason_code, direct.body.reason_code);
    assert.equal(alias.body.text, direct.body.text);

    // The old name stays in the catalog next to the new one.
    const catalog = (await (await fetch(`${f.gateway.url}/v1/tools`)).json()) as { tools: { name: string }[] };
    const names = catalog.tools.map((tool) => tool.name);
    assert.ok(names.includes('get_request_status'));
    assert.ok(names.includes('action_status'));
  } finally {
    await f.close();
  }
});
