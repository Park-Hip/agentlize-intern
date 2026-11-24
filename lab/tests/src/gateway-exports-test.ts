import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  createPolicyEngine,
  DEFAULT_RULES_PATH,
  esc,
  KeyStore,
  openGatewayDatabase,
  resolveRulesPath,
  RULES_FILE,
  rulesSchema,
  seedRulesFile,
  TraceStore,
} from '@lab/gateway';

/*
 * The console is a second package: it imports these five things from
 * `@lab/gateway` instead of copying them (ADR-0006 section 3.4). This test is
 * the consumer's view, so a broken `exports` field or a renamed export fails
 * here rather than in the console.
 */

test('gateway package: the rule file, its schema, the key store, the escape function and the trace reader are importable', () => {
  const rules = JSON.parse(readFileSync(DEFAULT_RULES_PATH, 'utf8')) as unknown;
  const parsed = rulesSchema.parse(rules);
  assert.equal(parsed.version, 1);
  assert.ok(Object.keys(parsed.resources).includes('task'));
  assert.ok(Object.keys(parsed.resources['task']?.read ?? {}).includes('staff'));

  const engine = createPolicyEngine();
  assert.equal(engine.decide(null).ruleId, 'INPUT_INVALID');
  assert.equal(engine.allowedFields('staff', 'employee', 'tho-than-desktop').fields.includes('work_email'), true);

  assert.equal(esc('<b>"x" & \'y\'</b>'), '&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;');

  assert.equal(resolveRulesPath('/data/lab', {}), join('/data/lab', RULES_FILE));
  assert.equal(typeof seedRulesFile, 'function');
});

test('gateway package: the key store and the trace reader run on a database the console opens', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lab-exports-'));
  const db = openGatewayDatabase(dir);
  try {
    const keys = new KeyStore(db);
    const issued = keys.issue({ employeeId: 'NV-07', caller: 'test' });
    assert.equal(keys.findByRawKey(issued.rawKey)?.employeeId, 'NV-07');

    const trace = new TraceStore(db);
    trace.append({
      traceId: 'tr-export-test',
      requester: 'NV-07',
      caller: 'test',
      entry: 'http',
      tool: 'get_task',
      objectId: 'T-12',
      outcome: 'ok',
      reasonCode: null,
      outOfScope: false,
      ruleId: 'task.read.staff',
      policyVersion: 1,
      hostUser: null,
      durationMs: 1,
    });
    assert.equal(trace.list()[0]?.traceId, 'tr-export-test');
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
