import assert from 'node:assert/strict';
import test from 'node:test';
import { runConversation } from './conversation.js';
import { turnCostUsd } from './cost.js';
import { createFakeModel, createScriptedDoor, type FakeStep, type ScriptedDoorHandler } from './fake-model.js';
import { LAN_OPEN_TASKS, findJob } from './jobs.js';
import type { UsageReporter, TurnUsage } from './usage.js';

const FIND_MINH_TEXT = [
  'Tìm thấy 1 nhân viên.',
  'Không hiện theo quyền của bạn: Số điện thoại cá nhân, Địa chỉ nhà.',
  '<<<DỮ LIỆU TỪ HỆ THỐNG>>>',
  'Mã: NV-04 | Tên: Vũ Quốc Minh | Phòng: Vận hành | Vai: staff | Email công việc: minh.vu@lab.example',
  '<<<HẾT DỮ LIỆU TỪ HỆ THỐNG>>>',
].join('\n');

const PROPOSE_T12_TEXT = [
  'Đã soạn đề xuất dx-0123456789abcdef cho task T-12. Chưa có gì được ghi vào task.',
  'Link xác nhận:',
  'http://127.0.0.1:8790/xac-nhan/dx-0123456789abcdef',
].join('\n');

const PROPOSE_BULK_TEXT = [
  'Đã soạn đề xuất dx-fedcba9876543210 cho 30 task. Chưa có gì được ghi vào task.',
  'Việc này cần trưởng nhóm Vận hành duyệt vì đề xuất có 30 mục, chạm ngưỡng duyệt hàng loạt.',
  'Link xác nhận:',
  'http://127.0.0.1:8790/xac-nhan/dx-fedcba9876543210',
].join('\n');

const NAM_REFUSAL_TEXT =
  'CHƯA THỰC HIỆN [NOT_PERMITTED] Bộ luật quyền không cho vai của bạn chuyển người phụ trách hoặc hạn của task. '
  + 'Hãy hỏi Trần Văn Quang, trưởng nhóm Vận hành.';

const SCRIPTS: Readonly<Record<string, readonly FakeStep[]>> = {
  'lookup-minh-phone': [
    { toolCalls: [{ name: 'find_employee', arguments: { name: 'Minh' } }] },
    { text: 'Anh Minh là Vũ Quốc Minh (NV-04), phòng Vận hành. Số điện thoại cá nhân không hiện theo quyền của bạn.' },
  ],
  'assign-t12-to-minh': [
    {
      toolCalls: [
        {
          name: 'propose_task_change',
          arguments: { task_ids: ['T-12'], changes: { assignee: 'NV-04', due: '2026-11-27' } },
        },
      ],
    },
    { text: 'Đã soạn đề xuất cho T-12, chưa ghi gì. Bạn mở link xác nhận và bấm Gửi.' },
  ],
  'reassign-lan-tasks': [
    { toolCalls: [{ name: 'list_tasks', arguments: { assignee: 'NV-03' } }] },
    { toolCalls: [{ name: 'propose_task_change', arguments: { task_ids: LAN_OPEN_TASKS, changes: { assignee: 'NV-04' } } }] },
    { text: 'Đã soạn đề xuất cho 30 task, chưa ghi gì. Việc này cần trưởng nhóm duyệt sau khi bạn bấm Gửi.' },
  ],
  'nam-assign-t12': [
    { toolCalls: [{ name: 'propose_task_change', arguments: { task_ids: ['T-12'], changes: { assignee: 'NV-04' } } }] },
    { text: 'Bạn không có quyền chuyển người phụ trách task T-12. Hãy hỏi anh Quang, trưởng nhóm Vận hành.' },
  ],
};

const HANDLERS: Readonly<Record<string, ScriptedDoorHandler>> = {
  'lookup-minh-phone': (input) => {
    assert.equal(input.name, 'find_employee');
    return { text: FIND_MINH_TEXT };
  },
  'assign-t12-to-minh': (input) => {
    assert.equal(input.name, 'propose_task_change');
    return { text: PROPOSE_T12_TEXT };
  },
  'reassign-lan-tasks': (input) => {
    if (input.name === 'list_tasks') return { text: 'Có 34 task khớp.' };
    assert.equal(input.name, 'propose_task_change');
    return { text: PROPOSE_BULK_TEXT, reasonCode: 'NEEDS_APPROVAL' };
  },
  'nam-assign-t12': (input) => {
    assert.equal(input.name, 'propose_task_change');
    return { text: NAM_REFUSAL_TEXT, reasonCode: 'NOT_PERMITTED', isError: true };
  },
};

function recorder(): { reporter: UsageReporter; reports: TurnUsage[] } {
  const reports: TurnUsage[] = [];
  return {
    reports,
    reporter: {
      async report(usage) {
        reports.push(usage);
        return { reported: true, status: 200 };
      },
    },
  };
}

/** Every clock read advances by 5, so the loop's model time is exact. */
function tickClock(): () => number {
  let tick = 0;
  return () => {
    tick += 5;
    return tick;
  };
}

const OFF_PEAK = () => new Date('2026-11-22T00:00:00Z');

test('conversation: the fake model and a scripted door pass all four jobs without a key', async () => {
  for (const [jobId, script] of Object.entries(SCRIPTS)) {
    const job = findJob(jobId);
    assert.ok(job !== undefined, `${jobId} must exist`);
    const model = createFakeModel({ steps: script });
    const scripted = createScriptedDoor(HANDLERS[jobId] ?? (() => ({ text: '' })));
    const usage = recorder();
    const turnId = `turn-test-${jobId}`;

    const outcome = await runConversation({
      job,
      turnId,
      model,
      door: scripted.door,
      usage: usage.reporter,
      now: tickClock(),
      nowDate: OFF_PEAK,
    });

    assert.equal(outcome.verdict.correct, true, `${jobId}: ${outcome.verdict.reason}`);
    assert.equal(outcome.usageReported, true, `${jobId} must report its cost`);
    assert.equal(outcome.record.stopReason, 'answer');
    assert.ok(outcome.record.toolCalls.length > 0);
    assert.equal(outcome.modelMs, 5 * outcome.modelCalls);
    assert.equal(outcome.gatewayMs, 12 * outcome.toolCalls);
    assert.equal(outcome.turnUsage.turnId, turnId);
    assert.equal(outcome.turnUsage.costUsd, turnCostUsd(outcome.usage, OFF_PEAK()));
    assert.equal(usage.reports.length, 1);
    assert.deepEqual(usage.reports[0], outcome.turnUsage);
    assert.ok(scripted.calls.every((call) => call.turnId === turnId), `${jobId} must send X-Lab-Turn on every call`);
    assert.equal(scripted.calls.length, outcome.toolCalls);
  }
});

test('conversation: the loop stops at the step limit and keeps no final answer', async () => {
  const job = findJob('lookup-minh-phone');
  assert.ok(job !== undefined);
  const steps: FakeStep[] = Array.from({ length: 10 }, () => ({
    toolCalls: [{ name: 'find_employee', arguments: { name: 'Minh' } }],
  }));
  const scripted = createScriptedDoor(() => ({ text: FIND_MINH_TEXT }));

  const outcome = await runConversation({
    job,
    turnId: 'turn-step-limit',
    model: createFakeModel({ steps }),
    door: scripted.door,
    usage: recorder().reporter,
    maxSteps: 2,
    now: tickClock(),
    nowDate: OFF_PEAK,
  });

  assert.equal(outcome.record.stopReason, 'max_steps');
  assert.equal(outcome.record.finalAnswer, '');
  assert.equal(outcome.modelCalls, 2);
  assert.equal(outcome.toolCalls, 2);
});

test('conversation: a turn with no tool call costs nothing to report and is graded wrong', async () => {
  const job = findJob('lookup-minh-phone');
  assert.ok(job !== undefined);
  const usage = recorder();

  const outcome = await runConversation({
    job,
    turnId: 'turn-no-tool',
    model: createFakeModel({ steps: [{ text: 'Chào bạn.' }] }),
    door: createScriptedDoor(() => ({ text: '' })).door,
    usage: usage.reporter,
    now: tickClock(),
    nowDate: OFF_PEAK,
  });

  assert.equal(outcome.usageReported, false);
  assert.equal(usage.reports.length, 0);
  assert.deepEqual(outcome.verdict, { correct: false, reason: 'missing_find_employee' });
});
