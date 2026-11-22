import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FAULT_TIMEOUT_MS,
  buildFaultSummary,
  countProposals,
  createFaultDoor,
  faultModeForRun,
  startFaultServers,
} from './faults.js';
import type { ToolDoor } from './door.js';
import type { ConversationRecord, ToolCallRecord } from './jobs.js';
import { TOOL_SPECS, createScriptedDoor } from './fake-model.js';

const PROPOSAL_TEXT = [
  'Đã soạn đề xuất dx-0123456789abcdef cho task T-12. Chưa có gì được ghi vào task.',
  'Link xác nhận:',
  'http://127.0.0.1:8790/xac-nhan/dx-0123456789abcdef',
].join('\n');

function proposal(taskIds: readonly string[], text = PROPOSAL_TEXT): ToolCallRecord {
  return {
    name: 'propose_task_change',
    args: { task_ids: taskIds, changes: { assignee: 'NV-04' } },
    text,
    reasonCode: null,
    isError: false,
  };
}

function record(toolCalls: readonly ToolCallRecord[]): ConversationRecord {
  return { finalAnswer: 'x', toolCalls, stopReason: 'answer' };
}

test('faults: the M2 plan mirrors the first twenty runs of m2-scenarios', () => {
  const modes = Array.from({ length: 20 }, (_, index) => faultModeForRun(index + 1));
  assert.deepEqual(modes.slice(0, 10), Array(10).fill('network'));
  assert.equal(modes[10], 'timeout');
  assert.deepEqual(modes.slice(11, 15), Array(4).fill('network'));
  assert.deepEqual(modes.slice(15), Array(5).fill('none'));
  assert.equal(FAULT_TIMEOUT_MS, 2_000);
});

test('faults: the refuser resets and the silent port never answers', async () => {
  const servers = await startFaultServers();
  try {
    await assert.rejects(fetch(servers.refuserUrl), /fetch failed|ECONNRESET|other side closed/i);
    await assert.rejects(
      fetch(servers.blackHoleUrl, { signal: AbortSignal.timeout(250) }),
      (error: unknown) => error instanceof Error && error.name === 'TimeoutError',
    );
  } finally {
    await servers.close();
  }
});

test('faults: a network fault is counted once and the real call still runs', async () => {
  const scripted = createScriptedDoor(() => ({ text: PROPOSAL_TEXT }));
  const broken: ToolDoor = {
    name: 'function',
    async listTools() {
      return TOOL_SPECS;
    },
    async callTool() {
      throw new Error('connection reset');
    },
  };
  const faulted = createFaultDoor({
    door: scripted.door,
    mode: 'network',
    faultUrl: 'http://127.0.0.1:1',
    createFaultDoor: async () => broken,
  });

  const answer = await faulted.door.callTool({
    name: 'propose_task_change',
    args: { task_ids: ['T-12'], changes: { assignee: 'NV-04' } },
    turnId: 'turn-1',
  });
  assert.ok(answer.text.includes('Link xác nhận'));
  assert.equal(faulted.counters.faultUsed, true);
  assert.equal(faulted.counters.networkErrors, 1);
  assert.equal(faulted.counters.timeouts, 0);
  assert.equal(faulted.counters.retries, 1);
  assert.equal(scripted.calls.length, 1, 'the real door runs once, after the failed attempt');
});

test('faults: a timeout is counted at the cut and the real call still runs', async () => {
  const scripted = createScriptedDoor(() => ({ text: PROPOSAL_TEXT }));
  const silent: ToolDoor = {
    name: 'function',
    async listTools() {
      return TOOL_SPECS;
    },
    callTool() {
      return new Promise(() => {
        // Never answers.
      });
    },
  };
  const faulted = createFaultDoor({
    door: scripted.door,
    mode: 'timeout',
    faultUrl: 'http://127.0.0.1:2',
    createFaultDoor: async () => silent,
    timeoutMs: 20,
  });

  const started = performance.now();
  const answer = await faulted.door.callTool({
    name: 'propose_task_change',
    args: { task_ids: ['T-12'], changes: { assignee: 'NV-04' } },
    turnId: 'turn-2',
  });
  assert.ok(answer.text.includes('Link xác nhận'));
  assert.ok(performance.now() - started >= 15, 'the timeout waits for its cut');
  assert.equal(faulted.counters.faultUsed, true);
  assert.equal(faulted.counters.networkErrors, 0);
  assert.equal(faulted.counters.timeouts, 1);
  assert.equal(faulted.counters.retries, 1);
  assert.equal(scripted.calls.length, 1);
});

test('faults: only the first proposal is faulted, and reads pass through untouched', async () => {
  const scripted = createScriptedDoor((input) => ({
    text: input.name === 'propose_task_change' ? PROPOSAL_TEXT : 'Tìm thấy 1 nhân viên.',
  }));
  let faultDoors = 0;
  const broken: ToolDoor = {
    name: 'function',
    async listTools() {
      return TOOL_SPECS;
    },
    async callTool() {
      throw new Error('connection reset');
    },
  };
  const faulted = createFaultDoor({
    door: scripted.door,
    mode: 'network',
    faultUrl: 'http://127.0.0.1:3',
    createFaultDoor: async () => {
      faultDoors += 1;
      return broken;
    },
  });

  await faulted.door.callTool({ name: 'find_employee', args: { name: 'Minh' }, turnId: 'turn-3' });
  await faulted.door.callTool({
    name: 'propose_task_change',
    args: { task_ids: ['T-12'], changes: { assignee: 'NV-04' } },
    turnId: 'turn-3',
  });
  await faulted.door.callTool({
    name: 'propose_task_change',
    args: { task_ids: ['T-13'], changes: { assignee: 'NV-04' } },
    turnId: 'turn-3',
  });

  assert.equal(faultDoors, 1);
  assert.equal(faulted.counters.retries, 1);
  assert.equal(scripted.calls.length, 3);
});

test('faults: proposal counting finds duplicates and missing tasks', () => {
  assert.deepEqual(countProposals(record([proposal(['T-12'])]), ['T-12']), {
    proposals: 1,
    duplicateTasks: 0,
    incompleteTasks: 0,
  });
  assert.deepEqual(
    countProposals(record([proposal(['T-12']), proposal(['T-12'])]), ['T-12']),
    { proposals: 2, duplicateTasks: 1, incompleteTasks: 0 },
  );
  assert.deepEqual(
    countProposals(record([proposal(['T-12'])]), ['T-12', 'T-13']),
    { proposals: 1, duplicateTasks: 0, incompleteTasks: 1 },
  );
  // No proposal is a model miss, not a lost command; the grader reports it.
  assert.deepEqual(countProposals(record([]), ['T-12']), {
    proposals: 0,
    duplicateTasks: 0,
    incompleteTasks: 0,
  });
  // A refusal is not a successful proposal.
  const refused: ToolCallRecord = {
    ...proposal(['T-12']),
    text: 'CHƯA THỰC HIỆN [NOT_PERMITTED] ...',
    reasonCode: 'NOT_PERMITTED',
    isError: true,
  };
  assert.deepEqual(countProposals(record([refused]), ['T-12']), {
    proposals: 0,
    duplicateTasks: 0,
    incompleteTasks: 0,
  });
});

test('faults: the result block counts runs, faults, retries and the proposal twins of writes', () => {
  const summary = buildFaultSummary(
    [
      {
        mode: 'network',
        attempted: true,
        network_errors: 1,
        timeouts: 0,
        retries: 1,
        proposals: 1,
        duplicate_proposals: 0,
        incomplete_proposals: 0,
      },
      {
        mode: 'timeout',
        attempted: true,
        network_errors: 0,
        timeouts: 1,
        retries: 1,
        proposals: 1,
        duplicate_proposals: 1,
        incomplete_proposals: 0,
      },
      {
        mode: 'network',
        attempted: false,
        network_errors: 0,
        timeouts: 0,
        retries: 0,
        proposals: 0,
        duplicate_proposals: 0,
        incomplete_proposals: 0,
      },
      {
        mode: 'none',
        attempted: false,
        network_errors: 0,
        timeouts: 0,
        retries: 0,
        proposals: 1,
        duplicate_proposals: 0,
        incomplete_proposals: 2,
      },
    ],
    'm2',
    25,
  );

  assert.equal(summary.plan, 'm2');
  assert.equal(summary.timeout_ms, 25);
  assert.equal(summary.network_runs, 2);
  assert.equal(summary.timeout_runs, 1);
  assert.equal(summary.clean_runs, 1);
  assert.equal(summary.point_missed, 1);
  assert.equal(summary.network_errors, 1);
  assert.equal(summary.timeouts, 1);
  assert.equal(summary.retries, 2);
  assert.equal(summary.duplicate_proposals, 1);
  assert.equal(summary.incomplete_proposals, 2);
  assert.equal(summary.duplicate_writes, 0);
  assert.equal(summary.lost_commands, 0);
  assert.match(summary.note, /không tạo lệnh ghi nào/);
});
