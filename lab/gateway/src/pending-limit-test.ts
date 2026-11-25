import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { startFixture } from './fixture.js';
import { rulesSchema } from './policy/index.js';

const HOA = 'NV-02';
const NHUNG = 'NV-06';
const MINUTE = 60_000;

test('pending limit: a rule file without the key gets the default of 20', () => {
  const rules = JSON.parse(readFileSync(new URL('../policy/rules.json', import.meta.url), 'utf8')) as Record<string, unknown>;
  delete rules['pending_limit'];
  const parsed = rulesSchema.parse(rules);
  assert.equal(parsed.pending_limit, 20);
});

test('pending limit: with the shipped rule file the 21st waiting proposal is refused', async () => {
  const clock = { at: Date.parse('2026-11-17T09:00:00.000Z') };
  const f = await startFixture({ now: () => new Date(clock.at) });
  try {
    const key = f.keyFor(HOA);
    for (let index = 1; index <= 20; index += 1) {
      const drafted = await f.call('propose_task_change', { task_ids: ['T-12'], changes: { status: 'done' } }, key);
      assert.equal(drafted.status, 200, `draft ${index}: ${drafted.body.text}`);
    }
    assert.equal(f.gateway.proposals.countPending(HOA), 20);

    const refused = await f.call('propose_task_change', { task_ids: ['T-12'], changes: { status: 'done' } }, key);
    assert.equal(refused.status, 429);
    assert.equal(refused.body.reason_code, 'PENDING_LIMIT');
    assert.equal(f.gateway.proposals.countPending(HOA), 20);
  } finally {
    await f.close();
  }
});

test('pending limit: the rule file can lower the cap, and the cap is per person', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lab-pending-limit-'));
  const rulesPath = join(dir, 'rules.json');
  const rules = JSON.parse(readFileSync(new URL('../policy/rules.json', import.meta.url), 'utf8')) as Record<string, unknown>;
  rules['pending_limit'] = 2;
  writeFileSync(rulesPath, JSON.stringify(rules, null, 2));

  const clock = { at: Date.parse('2026-11-17T09:00:00.000Z') };
  const f = await startFixture({ rulesPath, now: () => new Date(clock.at) });
  try {
    const hoa = f.keyFor(HOA);
    const propose = () => f.call('propose_task_change', { task_ids: ['T-12'], changes: { status: 'done' } }, hoa);

    assert.equal((await propose()).status, 200);
    assert.equal((await propose()).status, 200);
    assert.equal(f.gateway.proposals.countPending(HOA), 2);

    // The cap is per person: another person still has a free slot.
    const nhung = await f.call(
      'propose_employee_change',
      { employee_id: 'NV-04', work_email: 'minh.moi@lab.example' },
      f.keyFor(NHUNG),
    );
    assert.equal(nhung.status, 200, nhung.body.text);

    const refused = await propose();
    assert.equal(refused.status, 429);
    assert.equal(refused.body.reason_code, 'PENDING_LIMIT');
    assert.equal(refused.body.deny_reason, 'no_permission');
    assert.match(refused.body.text, /^CHƯA THỰC HIỆN \[PENDING_LIMIT\] /);
    assert.match(refused.body.text, /2 đề xuất chờ xử lý/);
    assert.equal(f.gateway.proposals.countPending(HOA), 2, 'a refused draft leaves no proposal');

    const line = f.gateway.trace.list()[0];
    assert.equal(line?.reasonCode, 'PENDING_LIMIT');
    assert.equal(line?.ruleId, 'PROPOSALS.pending_limit');

    // The old drafts no longer count after their 30 minutes, even before anyone opens them.
    clock.at += 31 * MINUTE;
    assert.equal(f.gateway.proposals.countPending(HOA), 0);
    assert.equal((await propose()).status, 200);
    assert.equal(f.gateway.proposals.countPending(HOA), 1);
  } finally {
    await f.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
