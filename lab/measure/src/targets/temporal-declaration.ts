import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { M5Declaration, RuleChangeApplication } from './m5-declaration.js';
import { TemporalTarget } from './temporal.js';
import type { WriteTarget } from './types.js';

/** The committed rule file; the target seeds its live copy into the data folder. */
const RULE_FILE = 'lab/gateway/policy/rules.json';
const RULE_CELL_PATH = ['resources', 'task', 'actions', 'change_task_assignee_or_due', 'staff', 'effect'] as const;
const RULE_CELL = RULE_CELL_PATH.join('.');
/** The trace id of the cell, without the `.bulk` or `.scope` suffixes. */
const RULE_ID = 'task.change_task_assignee_or_due.staff';
const BEFORE = 'allow';
const AFTER = 'deny';
/** Chị Hoa is staff of Vận hành; T-5 is an open task of that department. */
const PROBE_TASKS = ['T-5'] as const;
const PROBE_CHANGES = { assignee: 'NV-04' } as const;

function objectAt(root: Record<string, unknown>, path: string): Record<string, unknown> {
  let current: unknown = root;
  for (const key of path.split('.')) {
    if (typeof current !== 'object' || current === null || Array.isArray(current)) {
      throw new Error(`the live rule file has no object at ${path}`);
    }
    current = (current as Record<string, unknown>)[key];
  }
  if (typeof current !== 'object' || current === null || Array.isArray(current)) {
    throw new Error(`the live rule file has no object at ${path}`);
  }
  return current as Record<string, unknown>;
}

function cellValue(rules: Record<string, unknown>): unknown {
  const parentPath = RULE_CELL_PATH.slice(0, -1).join('.');
  const last = RULE_CELL_PATH[RULE_CELL_PATH.length - 1];
  if (last === undefined) throw new Error('the declared rule cell is empty');
  return objectAt(rules, parentPath)[last];
}

function setCellValue(rules: Record<string, unknown>, value: string): void {
  const parentPath = RULE_CELL_PATH.slice(0, -1).join('.');
  const last = RULE_CELL_PATH[RULE_CELL_PATH.length - 1];
  if (last === undefined) throw new Error('the declared rule cell is empty');
  objectAt(rules, parentPath)[last] = value;
}

const declaration: M5Declaration = {
  target: 'temporal',

  continuation_files: [
    {
      path: 'lab/baselines/temporal/src/workflows.js',
      role: 'workflow writeProposal: giữ vị trí 30 lệnh và gọi một activity cho mỗi lệnh',
    },
    {
      path: 'lab/baselines/temporal/src/worker.js',
      role: 'worker Temporal và activity runCommand: gọi host, để Temporal lo lần thử lại',
    },
    {
      path: 'lab/baselines/temporal/src/host.js',
      role: 'nối đề xuất đã duyệt sang workflow và mở cổng điều khiển cho activity',
    },
    {
      path: 'lab/baselines/temporal/src/command-runner.js',
      role: 'chạy một lệnh ghi qua bảng write_commands, mã chống ghi trùng và bộ tiếp hợp task',
    },
  ],

  excluded_files: [
    {
      path: 'lab/baselines/temporal/package.json',
      reason: 'khai phụ thuộc và lệnh chạy, không có logic chạy tiếp',
    },
  ],

  services: [
    {
      name: 'temporal',
      purpose: 'Temporal dev server giữ workflow và vị trí từng bước',
      required_for_writes: true,
      source: { path: 'lab/baselines/temporal/README.md', line: 106 },
    },
    {
      name: 'worker',
      purpose: 'chạy activity, mỗi activity một lệnh ghi',
      required_for_writes: true,
      source: { path: 'lab/baselines/temporal/README.md', line: 107 },
    },
    {
      name: 'gateway',
      purpose: 'đề xuất, bấm Gửi, duyệt, bảng lệnh ghi và bảng vết',
      required_for_writes: true,
      source: { path: 'lab/baselines/temporal/README.md', line: 108 },
    },
    {
      name: 'directory',
      purpose: 'danh bạ giả, nơi cổng đọc vai và phòng của người yêu cầu',
      required_for_writes: true,
      source: { path: 'lab/baselines/temporal/README.md', line: 109 },
    },
    {
      name: 'tasks',
      purpose: 'danh sách task giả, nơi lệnh ghi đáp xuống',
      required_for_writes: true,
      source: { path: 'lab/baselines/temporal/README.md', line: 110 },
    },
  ],

  config_files: [
    {
      path: 'lab/gateway/policy/rules.json',
      purpose: 'luật quyền theo vai, ngưỡng hàng loạt và người duyệt; Temporal dev server chỉ nhận cờ dòng lệnh, không có file cấu hình',
      source: { path: 'lab/gateway/README.md', line: 73 },
    },
  ],

  install_steps: [
    {
      step: 'Cài Node 22 trở lên',
      source: { path: 'lab/baselines/temporal/README.md', line: 18 },
    },
    {
      step: 'Chạy npm install và npm run build trong lab/',
      source: { path: 'lab/baselines/temporal/README.md', line: 23 },
    },
    {
      step: 'Chạy npm install trong lab/baselines/temporal/',
      source: { path: 'lab/baselines/temporal/README.md', line: 31 },
    },
    {
      step: 'Lấy Temporal CLI: dùng temporal trên PATH hoặc tải bản phát hành vào scratch/temporal/',
      source: { path: 'lab/baselines/temporal/README.md', line: 36 },
    },
  ],

  crash_steps: [
    {
      step: 'Khởi động lại worker trên cùng Temporal dev server; workflow chạy tiếp từ activity đang dở',
      source: { path: 'lab/baselines/temporal/README.md', line: 99 },
    },
    {
      step: 'Nếu dev server cũng tắt, mở lại trên cùng --db-filename rồi khởi động worker',
      source: { path: 'lab/baselines/temporal/README.md', line: 100 },
    },
  ],

  source_roots: ['lab/baselines/temporal', 'lab/gateway', 'lab/fake-directory', 'lab/fake-tasks', 'lab/shared', 'lab/scripts'],

  rule_change: {
    file: RULE_FILE,
    cell: RULE_CELL,
    before: BEFORE,
    after: AFTER,
    source: { path: 'lab/gateway/README.md', line: 75 },

    async apply(target: WriteTarget): Promise<RuleChangeApplication> {
      if (!(target instanceof TemporalTarget)) {
        throw new Error('the temporal M5 declaration only runs against the temporal target');
      }

      const livePath = target.liveRulesPath();
      const rules = JSON.parse(await readFile(livePath, 'utf8')) as Record<string, unknown>;
      const before = cellValue(rules);
      if (before !== BEFORE) {
        throw new Error(`the live rule cell is ${String(before)}, but the declaration says ${BEFORE}`);
      }

      const beforeAnswer = await target.draftTaskChange(PROBE_TASKS, PROBE_CHANGES);
      if (beforeAnswer.status !== 200) {
        throw new Error(`the draft under the old rule answered ${beforeAnswer.status}, expected 200`);
      }

      setCellValue(rules, AFTER);
      await writeFile(livePath, `${JSON.stringify(rules, null, 2)}\n`, 'utf8');

      const afterAnswer = await target.draftTaskChange(PROBE_TASKS, PROBE_CHANGES);
      // The trace is newest first, so the first draft row is the refused one.
      const refusedRow = target.observe().trace.find((row) => row.tool === 'propose_task_change');

      return {
        before: String(before),
        after: AFTER,
        changed_files: [basename(livePath)],
        applied:
          afterAnswer.status === 403 &&
          afterAnswer.reasonCode === 'NOT_PERMITTED' &&
          refusedRow?.ruleId === RULE_ID,
        before_answer: { status: beforeAnswer.status, reason_code: beforeAnswer.reasonCode },
        after_answer: { status: afterAnswer.status, reason_code: afterAnswer.reasonCode },
        rule_id: refusedRow?.ruleId ?? null,
      };
    },
  },
};

export default declaration;
