import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runTraceCli } from '../cli/trace.js';
import { openGatewayDatabase, type GatewayDatabase } from '../database.js';
import { DEFAULT_PENDING_LIMIT } from '../policy/index.js';
import { ProposalStore } from '../proposals/proposal-store.js';
import { TraceStore, type TraceRecord } from './trace-store.js';

const HOA = 'NV-02';
const QUANG = 'NV-01';

function sample(overrides: Partial<TraceRecord>): TraceRecord {
  return {
    traceId: 'tr-0000000000000001',
    requester: HOA,
    caller: 'tho-than-desktop',
    entry: 'http',
    tool: 'get_task',
    objectId: 'T-12',
    outcome: 'ok',
    reasonCode: null,
    outOfScope: false,
    ruleId: 'task.read.staff',
    policyVersion: 3,
    hostUser: null,
    proposalId: null,
    idempotencyKey: null,
    attempts: null,
    durationMs: 4,
    ...overrides,
  };
}

interface Seeded {
  readonly db: GatewayDatabase;
  readonly trace: TraceStore;
  readonly proposalId: string;
  readonly rejectedProposalId: string;
  close(): void;
}

/** A real proposal store and trace store on one temporary gateway database. */
function seed(): Seeded {
  const dir = mkdtempSync(join(tmpdir(), 'lab-trace-task-'));
  const db = openGatewayDatabase(dir);
  const proposals = new ProposalStore(db, () => new Date('2026-11-18T09:00:00.000Z'));
  const proposal = proposals.create({
    requester: HOA,
    caller: 'tho-than-desktop',
    authorization: { kind: 'key', id: 'key-0123456789abcdef' },
    tool: 'propose_task_change',
    recordType: 'task',
    changes: { assignee: 'NV-04' },
    requiresApproval: true,
    policyVersion: 3,
    items: ['T-12', 'T-13', 'T-17'].map((recordId) => ({
      system: 'tasks',
      recordType: 'task',
      recordId,
      baseVersion: 1,
      previous: { assignee: 'NV-03' },
      changes: { assignee: 'NV-04' },
    })),
  }, DEFAULT_PENDING_LIMIT);
  const rejected = proposals.create({
    requester: HOA,
    caller: 'tho-than-desktop',
    authorization: { kind: 'key', id: 'key-0123456789abcdef' },
    tool: 'propose_task_change',
    recordType: 'task',
    changes: { description: 'Mô tả mới.' },
    requiresApproval: true,
    policyVersion: 3,
    items: ['T-70', 'T-71'].map((recordId) => ({
      system: 'tasks',
      recordType: 'task',
      recordId,
      baseVersion: 1,
      previous: { description: 'Mô tả cũ.' },
      changes: { description: 'Mô tả mới.' },
    })),
  }, DEFAULT_PENDING_LIMIT);
  const trace = new TraceStore(db, () => new Date('2026-11-18T09:05:00.000Z'));

  const rows: TraceRecord[] = [
    sample({ traceId: 'tr-0000000000000001', tool: 'get_task', objectId: 'T-12', proposalId: null }),
    sample({
      traceId: 'tr-0000000000000002',
      entry: 'web',
      tool: 'proposal_send',
      objectId: 'T-12',
      ruleId: 'task.change_task_assignee_or_due.staff.bulk',
      proposalId: proposal.proposalId,
    }),
    sample({
      traceId: 'tr-0000000000000003',
      requester: QUANG,
      entry: 'web',
      tool: 'proposal_approve',
      objectId: 'T-12',
      ruleId: 'WEB.APPROVE',
      proposalId: proposal.proposalId,
    }),
    sample({
      traceId: 'tr-0000000000000004',
      entry: 'web',
      tool: 'write_command',
      objectId: 'T-13',
      ruleId: 'WRITE.SEND',
      proposalId: proposal.proposalId,
      idempotencyKey: `${proposal.proposalId}:2`,
      attempts: 1,
    }),
    sample({
      traceId: 'tr-0000000000000005',
      entry: 'web',
      tool: 'write_command',
      objectId: 'T-17',
      ruleId: 'WRITE.SEND',
      proposalId: proposal.proposalId,
      idempotencyKey: `${proposal.proposalId}:3`,
      attempts: 1,
    }),
    sample({ traceId: 'tr-0000000000000006', tool: 'get_task', objectId: 'T-70', proposalId: null }),
    sample({
      traceId: 'tr-0000000000000007',
      entry: 'web',
      tool: 'proposal_send',
      objectId: 'T-70',
      ruleId: 'task.edit_task_description.staff.bulk',
      proposalId: rejected.proposalId,
    }),
    sample({
      traceId: 'tr-0000000000000008',
      requester: QUANG,
      entry: 'web',
      tool: 'proposal_reject',
      objectId: 'T-70',
      ruleId: 'WEB.REJECT',
      proposalId: rejected.proposalId,
    }),
  ];
  for (const row of rows) trace.append(row);

  return {
    db,
    trace,
    proposalId: proposal.proposalId,
    rejectedProposalId: rejected.proposalId,
    close: () => {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('trace: the task filter reaches every line of a proposal, including its one approval', () => {
  const seeded = seed();
  try {
    const proposalLines = [
      'tr-0000000000000002',
      'tr-0000000000000003',
      'tr-0000000000000004',
      'tr-0000000000000005',
    ];
    for (const task of ['T-12', 'T-13', 'T-17']) {
      const rows = seeded.trace.list({ task });
      // T-12 is the first item, so its own read line matches as well.
      const expected = task === 'T-12' ? ['tr-0000000000000001', ...proposalLines] : proposalLines;
      assert.deepEqual(
        rows.map((row) => row.traceId).sort(),
        expected,
        `${task} belongs to the proposal, so the proposal's lines come back too`,
      );
      assert.equal(seeded.trace.count({ task }), expected.length);
      assert.equal(rows.filter((row) => row.proposalId === seeded.proposalId).length, 4);
      assert.equal(rows.filter((row) => row.tool === 'proposal_approve').length, 1, 'one approval line, never one per item');
      assert.deepEqual(
        rows.filter((row) => row.tool === 'proposal_approve').map((row) => row.requester),
        [QUANG],
        'the approval line names the approver',
      );
      assert.deepEqual(
        rows.filter((row) => row.proposalId === seeded.proposalId).map((row) => row.policyVersion),
        [3, 3, 3, 3],
        'every line keeps the policy version used at the time',
      );
    }

    const { trace } = seeded;
    assert.deepEqual(trace.list({ task: 'T-99' }), []);
    assert.equal(trace.count({ task: 'T-99' }), 0);
    assert.ok(
      trace
        .list({ task: 'T-12' })
        .every((row) => row.objectId === 'T-12' || row.proposalId === seeded.proposalId),
      'only the task itself and its proposal come back',
    );
  } finally {
    seeded.close();
  }
});

test('trace: a task in a rejected proposal shows its send and its one rejection, and no write', () => {
  const seeded = seed();
  try {
    const rows = seeded.trace.list({ task: 'T-71' });
    assert.deepEqual(rows.map((row) => row.traceId).sort(), ['tr-0000000000000007', 'tr-0000000000000008']);
    assert.equal(rows.filter((row) => row.tool === 'proposal_send').length, 1);
    assert.equal(rows.filter((row) => row.tool === 'proposal_reject').length, 1);
    assert.equal(rows.find((row) => row.tool === 'proposal_reject')?.requester, QUANG);
    assert.equal(rows.filter((row) => row.tool === 'write_command').length, 0, 'a rejection creates no write line');
    assert.ok(rows.every((row) => row.proposalId === seeded.rejectedProposalId && row.policyVersion === 3));
  } finally {
    seeded.close();
  }
});

test('trace: the task filter leaves no duplicate approval rows and the table still only grows', () => {
  const seeded = seed();
  try {
    const { db, trace, proposalId } = seeded;
    const approvalLines = trace.list({ proposal: proposalId }).filter((row) => row.tool === 'proposal_approve');
    assert.equal(approvalLines.length, 1);
    assert.equal(approvalLines[0]?.requester, QUANG);

    const columns = (db.prepare("PRAGMA table_info('trace')").all() as { name: string }[]).map((column) => column.name);
    assert.deepEqual(columns, [
      'seq',
      'trace_id',
      'at',
      'requester',
      'caller',
      'entry',
      'tool',
      'object_id',
      'outcome',
      'reason_code',
      'out_of_scope',
      'rule_id',
      'policy_version',
      'host_user',
      'turn_id',
      'proposal_id',
      'idempotency_key',
      'attempts',
      'dropped_fields',
      'duration_ms',
    ]);

    const countBefore = trace.count();
    trace.list({ task: 'T-17' });
    trace.count({ task: 'T-17' });
    assert.equal(trace.count(), countBefore, 'reading the trace never adds, changes or removes a line');
    assert.throws(() => db.prepare("UPDATE trace SET tool = 'x'").run(), /append-only/);
    assert.throws(() => db.prepare('DELETE FROM trace').run(), /append-only/);
  } finally {
    seeded.close();
  }
});

test('trace: a database without proposal_items still filters by object id', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lab-trace-old-'));
  const db = openGatewayDatabase(dir);
  try {
    const trace = new TraceStore(db, () => new Date('2026-11-18T09:05:00.000Z'));
    trace.append(sample({ traceId: 'tr-0000000000000001', objectId: 'T-12' }));
    trace.append(sample({ traceId: 'tr-0000000000000002', objectId: 'T-70', proposalId: 'dx-0123456789abcdef' }));

    assert.deepEqual(trace.list({ task: 'T-12' }).map((row) => row.traceId), ['tr-0000000000000001']);
    assert.deepEqual(trace.list({ task: 'T-70' }).map((row) => row.traceId), ['tr-0000000000000002']);
    assert.deepEqual(trace.list({ task: 'T-17' }), []);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('trace cli: --task prints the requester, the approver, the policy version and the write', () => {
  const seeded = seed();
  try {
    const lines: string[] = [];
    runTraceCli(['--task', 'T-17'], seeded.trace, { out: (line) => lines.push(line) });
    const rows = lines.slice(1);
    assert.equal(rows.length, 4);
    assert.equal(rows.filter((line) => /\sproposal_approve\s/.test(line)).length, 1);
    assert.match(lines.join('\n'), new RegExp(String.raw`${QUANG}\s+tho-than-desktop\s+web\s+proposal_approve\s+T-12\s+ok\s+-\s+-\s+WEB\.APPROVE\s+v3`));
    assert.match(lines.join('\n'), new RegExp(String.raw`${HOA}\s+tho-than-desktop\s+web\s+proposal_send\s+T-12\s+ok\s+-\s+-\s+task\.change_task_assignee_or_due\.staff\.bulk\s+v3`));
    assert.match(lines.join('\n'), new RegExp(String.raw`\swrite_command\s+T-17\s+ok\s+-\s+-\s+WRITE\.SEND\s+v3\s+-\s+${seeded.proposalId}\s+${seeded.proposalId}:3`));
  } finally {
    seeded.close();
  }
});
