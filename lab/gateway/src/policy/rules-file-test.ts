import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { RULES_PATH_ENV } from '@lab/shared';
import { BUSY_TIMEOUT_MS, GATEWAY_DB_FILE, openGatewayDatabase } from '../database.js';
import { startFixture } from '../fixture.js';
import { DEFAULT_RULES_PATH, resolveRulesPath, RULES_FILE, seedRulesFile } from './index.js';

// Every test file runs in its own process; a value from the shell must not decide where these cases read rules.
delete process.env[RULES_PATH_ENV];

const HOA = 'NV-02';

function shippedRules(): Record<string, unknown> {
  return JSON.parse(readFileSync(DEFAULT_RULES_PATH, 'utf8')) as Record<string, unknown>;
}

function rulesPathIn(dir: string): string {
  return join(dir, RULES_FILE);
}

test('rules path: the data folder is the default and LAB_RULES_PATH overrides it', () => {
  const dataDir = join(tmpdir(), 'lab-data');
  assert.equal(resolveRulesPath(dataDir, {}), join(dataDir, RULES_FILE));
  assert.equal(resolveRulesPath(dataDir, { [RULES_PATH_ENV]: '' }), join(dataDir, RULES_FILE));
  assert.equal(resolveRulesPath(dataDir, { [RULES_PATH_ENV]: '   ' }), join(dataDir, RULES_FILE));

  const absolute = join(tmpdir(), 'somewhere', RULES_FILE);
  assert.equal(resolveRulesPath(dataDir, { [RULES_PATH_ENV]: absolute }), resolve(absolute));
  const relative = join('rules', 'other.json');
  assert.equal(resolveRulesPath(dataDir, { [RULES_PATH_ENV]: relative }), resolve(relative));
});

test('rules file: the base copy is written once, and a copy someone edited is kept', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lab-rules-file-'));
  try {
    const path = rulesPathIn(dir);
    assert.equal(seedRulesFile(path), true, 'a missing file is copied');
    assert.equal(readFileSync(path, 'utf8'), readFileSync(DEFAULT_RULES_PATH, 'utf8'));

    writeFileSync(path, '{"version": 42}');
    assert.equal(seedRulesFile(path), false, 'an existing file is left alone');
    assert.equal(readFileSync(path, 'utf8'), '{"version": 42}');

    // A path outside the data folder works too; the parent folders are made on the way.
    const nested = join(dir, 'a', 'b', RULES_FILE);
    assert.equal(seedRulesFile(nested), true);
    assert.equal(readFileSync(nested, 'utf8'), readFileSync(DEFAULT_RULES_PATH, 'utf8'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('database: openGatewayDatabase turns on WAL and a lock wait', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lab-db-'));
  try {
    const db = openGatewayDatabase(dir);
    assert.equal(db.pragma('journal_mode', { simple: true }), 'wal');
    assert.equal(db.pragma('busy_timeout', { simple: true }), BUSY_TIMEOUT_MS);
    db.close();

    // The mode lives in the file, so the console gets it too when it opens the same database.
    const reader = new Database(join(dir, GATEWAY_DB_FILE));
    assert.equal(reader.pragma('journal_mode', { simple: true }), 'wal');
    reader.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rules path: an edited rule file applies to the next call, and a broken one refuses the write', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lab-rules-live-'));
  const f = await startFixture({ dir });
  try {
    const path = rulesPathIn(dir);
    assert.equal(readFileSync(path, 'utf8'), readFileSync(DEFAULT_RULES_PATH, 'utf8'), 'the gateway copied the base file');

    const key = f.keyFor(HOA);
    const before = await f.call('find_employee', { name: 'Minh' }, key);
    assert.equal(before.status, 200);
    assert.match(before.body.text, /Email công việc: nv-04@lab\.example/);

    // The operator removes work_email from the staff role and saves the file while the gateway keeps running.
    const edited = shippedRules();
    edited['version'] = 2;
    const resources = edited['resources'] as Record<string, { fields: Record<string, string[]> }>;
    const fields = resources['employee']?.fields ?? {};
    fields['staff'] = (fields['staff'] ?? []).filter((field) => field !== 'work_email');
    writeFileSync(path, JSON.stringify(edited, null, 2));

    const after = await f.call('find_employee', { name: 'Minh' }, key);
    assert.equal(after.status, 200);
    assert.match(after.body.text, /NV-04/, 'the right person is still found');
    assert.doesNotMatch(after.body.text, /Email công việc: /, 'the value of the hidden field is gone');
    assert.match(after.body.text, /Không hiện theo quyền của bạn: Email công việc, Số điện thoại cá nhân, Địa chỉ nhà\./);
    assert.equal(f.gateway.trace.list({ employee: HOA })[0]?.policyVersion, 2);

    // A file that cannot be read stops the write path with the code SR5 asks for.
    writeFileSync(path, '{ not json');
    const refused = await f.call('propose_task_change', { task_id: 'T-12', changes: { status: 'done' } }, key);
    assert.equal(refused.status, 503);
    assert.equal(refused.body.reason_code, 'POLICY_UNAVAILABLE');
    assert.match(refused.body.text, /^CHƯA THỰC HIỆN \[POLICY_UNAVAILABLE\] /);
    assert.equal(f.systems.writeCount('T-12'), 0, 'nothing reached the task list');
    const refusal = f.gateway.trace.list()[0];
    assert.equal(refusal?.reasonCode, 'POLICY_UNAVAILABLE');
    assert.equal(refusal?.policyVersion, null);
    assert.equal(refusal?.proposalId ?? null, null, 'no proposal was drafted');

    writeFileSync(path, readFileSync(DEFAULT_RULES_PATH, 'utf8'));
    assert.match((await f.call('get_task', { task_id: 'T-12' }, key)).body.text, /^Task T-12/, 'fixing the file recovers');
  } finally {
    await f.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rules path: a rule file already in the data folder is used and never overwritten at startup', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'lab-rules-keep-'));
  const path = rulesPathIn(dir);
  const mine = shippedRules();
  mine['version'] = 7;
  const resources = mine['resources'] as Record<string, { fields: Record<string, string[]> }>;
  const fields = resources['employee']?.fields ?? {};
  fields['staff'] = ['id', 'name', 'department', 'role'];
  const saved = JSON.stringify(mine, null, 2);
  writeFileSync(path, saved);

  const f = await startFixture({ dir });
  try {
    assert.equal(readFileSync(path, 'utf8'), saved, 'the operator copy is not touched');
    const answer = await f.call('find_employee', { name: 'Minh' }, f.keyFor(HOA));
    assert.doesNotMatch(answer.body.text, /Email công việc: /);
    assert.match(answer.body.text, /Không hiện theo quyền của bạn: Email công việc, Số điện thoại cá nhân, Địa chỉ nhà\./);
    assert.equal(f.gateway.trace.list()[0]?.policyVersion, 7, 'the gateway read the copy that was already there');
  } finally {
    await f.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('rules path: LAB_RULES_PATH moves the rule file out of the data folder', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'lab-rules-env-data-'));
  const rulesDir = mkdtempSync(join(tmpdir(), 'lab-rules-env-file-'));
  const path = join(rulesDir, 'operator-rules.json');
  const mine = shippedRules();
  mine['version'] = 3;
  const saved = JSON.stringify(mine, null, 2);
  writeFileSync(path, saved);

  // The fixture copies the process environment, so this one value is enough to point the gateway elsewhere.
  process.env[RULES_PATH_ENV] = path;
  const f = await startFixture({ dir: dataDir });
  try {
    assert.equal(readFileSync(path, 'utf8'), saved, 'the configured file is the one the gateway reads, untouched');
    assert.equal(readdirSync(dataDir).includes(RULES_FILE), false, 'no copy is made in the data folder');
    const answer = await f.call('find_employee', { name: 'Minh' }, f.keyFor(HOA));
    assert.match(answer.body.text, /Email công việc: nv-04@lab\.example/);
    assert.equal(f.gateway.trace.list()[0]?.policyVersion, 3);
  } finally {
    await f.close();
    delete process.env[RULES_PATH_ENV];
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(rulesDir, { recursive: true, force: true });
  }
});
