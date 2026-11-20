import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { GatewayTarget } from './gateway.js';
import type { M5Declaration, RuleChangeApplication } from './m5-declaration.js';
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
  target: 'gateway',

  continuation_files: [
    {
      path: 'lab/gateway/src/writes/outbox.ts',
      role: 'vòng chạy nền: nhặt lệnh còn mở, gửi lại bằng đúng mã cũ, ghi kết quả và giờ gửi lại',
    },
    {
      path: 'lab/gateway/src/writes/command-store.ts',
      role: 'bảng write_commands: trạng thái, số lần gửi và giờ gửi lại nằm trong cơ sở dữ liệu',
    },
  ],

  excluded_files: [
    {
      path: 'lab/gateway/src/writes/index.ts',
      reason: 'chỉ xuất lại các ký hiệu, không có logic chạy tiếp',
    },
    {
      path: 'lab/gateway/src/writes/authorize.ts',
      reason: 'kiểm quyền lúc bấm Gửi, không giữ tiến độ hay chạy lại',
    },
    {
      path: 'lab/gateway/src/proposals/proposal-store.ts',
      reason: 'kho đề xuất dùng chung cho mọi thao tác ghi, không riêng phần chạy tiếp',
    },
  ],

  services: [
    {
      name: 'gateway',
      purpose: 'nhận đề xuất, kiểm luật, tạo lệnh ghi và chạy vòng gửi nền',
      required_for_writes: true,
      source: { path: 'lab/README.md', line: 40 },
    },
    {
      name: 'directory',
      purpose: 'danh bạ giả, nơi cổng đọc vai và phòng của người yêu cầu',
      required_for_writes: true,
      source: { path: 'lab/README.md', line: 42 },
    },
    {
      name: 'tasks',
      purpose: 'danh sách task giả, nơi lệnh ghi thật sự đáp xuống',
      required_for_writes: true,
      source: { path: 'lab/README.md', line: 43 },
    },
    {
      name: 'console',
      purpose: 'trang điều khiển cho người vận hành, npm start mở cùng',
      required_for_writes: false,
      source: { path: 'lab/README.md', line: 41 },
    },
  ],

  config_files: [
    {
      path: 'lab/gateway/policy/rules.json',
      purpose: 'luật quyền theo vai, ngưỡng hàng loạt và người duyệt',
      source: { path: 'lab/gateway/README.md', line: 73 },
    },
  ],

  install_steps: [
    {
      step: 'Cài Node 22 trở lên',
      source: { path: 'lab/README.md', line: 18 },
    },
    {
      step: 'Chạy npm install trong lab/',
      source: { path: 'lab/README.md', line: 21 },
    },
    {
      step: 'Chạy npm start để mở cổng và hai hệ thống giả',
      source: { path: 'lab/README.md', line: 22 },
    },
    {
      step: 'Chạy npm run seed-keys để cấp khoá tool và mật khẩu trang',
      source: { path: 'lab/README.md', line: 29 },
    },
  ],

  crash_steps: [
    {
      step: 'Chạy lại npm start trên đúng thư mục dữ liệu; vòng chạy nền tự nhặt lệnh còn mở, không phải gửi lại bằng tay',
      source: { path: 'lab/gateway/README.md', line: 194 },
    },
  ],

  source_roots: ['lab/gateway', 'lab/fake-directory', 'lab/fake-tasks', 'lab/shared', 'lab/scripts'],

  rule_change: {
    file: RULE_FILE,
    cell: RULE_CELL,
    before: BEFORE,
    after: AFTER,
    source: { path: 'lab/gateway/README.md', line: 75 },

    async apply(target: WriteTarget): Promise<RuleChangeApplication> {
      if (!(target instanceof GatewayTarget)) {
        throw new Error('the gateway M5 declaration only runs against the gateway target');
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
