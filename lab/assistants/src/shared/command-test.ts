import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  main,
  parseAssistantArguments,
  readToolKey,
  TOOL_KEYS_ENV,
  TOOL_KEY_ENV,
  type AssistantDependencies,
} from './command.js';
import { createFakeModel, createScriptedDoor } from './fake-model.js';
import { readAssistantResult } from './result.js';
import type { TurnUsage } from './usage.js';

const HERE = dirname(fileURLToPath(import.meta.url));
/** `lab/assistants/dist/shared` -> the repository root. */
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..');

const FIND_MINH_TEXT = [
  'Tìm thấy 1 nhân viên.',
  'Không hiện theo quyền của bạn: Số điện thoại cá nhân, Địa chỉ nhà.',
  '<<<DỮ LIỆU TỪ HỆ THỐNG>>>',
  'Mã: NV-04 | Tên: Vũ Quốc Minh | Phòng: Vận hành | Vai: staff | Email công việc: minh.vu@lab.example',
  '<<<HẾT DỮ LIỆU TỪ HỆ THỐNG>>>',
].join('\n');

test('command: arguments parse into one door, one job and a bounded run count', () => {
  assert.deepEqual(parseAssistantArguments(['--door', 'mcp', '--job', 'lookup-minh-phone', '--runs', '2']), {
    door: 'mcp',
    job: 'lookup-minh-phone',
    runs: 2,
    out: undefined,
    maxSteps: 8,
    force: false,
    help: false,
  });
  assert.equal(parseAssistantArguments(['--door=function', '--job=nam-assign-t12']).door, 'function');
  assert.equal(parseAssistantArguments(['--help']).help, true);
  assert.throws(() => parseAssistantArguments(['--door', 'nope', '--job', 'x']), /--door must be one of/);
  assert.throws(() => parseAssistantArguments(['--door', 'mcp', '--job', 'x', '--runs', '0']), /--runs/);
  assert.throws(() => parseAssistantArguments(['--door', 'mcp', '--job', 'x', '--max-steps', '51']), /--max-steps/);
  assert.throws(() => parseAssistantArguments(['--nope']), /unknown option/);
  assert.throws(() => parseAssistantArguments(['stray']), /unexpected argument/);
});

test('command: the tool key comes from the persona map, then from the single-key fallback', () => {
  assert.equal(
    readToolKey({ [TOOL_KEYS_ENV]: JSON.stringify({ hoa: 'lab_hoa', nam: 'lab_nam' }) }, 'hoa'),
    'lab_hoa',
  );
  assert.equal(readToolKey({ [TOOL_KEY_ENV]: 'lab_single' }, 'nam'), 'lab_single');
  assert.throws(
    () => readToolKey({ [TOOL_KEYS_ENV]: JSON.stringify({ hoa: 'lab_hoa' }) }, 'nam'),
    /no key for persona "nam"/,
  );
  assert.throws(() => readToolKey({ [TOOL_KEYS_ENV]: 'not json' }, 'hoa'), /JSON object/);
  assert.throws(() => readToolKey({}, 'hoa'), /LAB_TOOL_KEYS/);
});

test('command: one run of a job writes a result file with the model and gateway times', async () => {
  const outDir = await mkdtemp(join(tmpdir(), 'lab-assistant-command-'));
  const reports: TurnUsage[] = [];
  const deps: AssistantDependencies = {
    env: {
      LAB_MODEL_API_KEY: 'model-key-for-tests',
      [TOOL_KEYS_ENV]: JSON.stringify({ hoa: 'lab_test_hoa', nam: 'lab_test_nam' }),
    },
    repoRoot: REPO_ROOT,
    log: () => {},
    now: () => new Date('2026-11-22T00:00:00Z'),
    clock: (() => {
      let tick = 0;
      return () => {
        tick += 5;
        return tick;
      };
    })(),
    createModel: () =>
      createFakeModel({
        steps: [
          { toolCalls: [{ name: 'find_employee', arguments: { name: 'Minh' } }] },
          { text: 'Anh Minh là Vũ Quốc Minh (NV-04). Số điện thoại cá nhân không hiện theo quyền của bạn.' },
        ],
      }),
    createDoor: async () => createScriptedDoor(() => ({ text: FIND_MINH_TEXT })).door,
    createUsage: () => ({
      async report(usage) {
        reports.push(usage);
        return { reported: true, status: 200 };
      },
    }),
  };

  try {
    const code = await main(
      ['--door', 'mcp', '--job', 'lookup-minh-phone', '--runs', '2', '--out', outDir],
      deps,
    );
    assert.equal(code, 0);
    assert.equal(reports.length, 2);

    const files = await readdir(outDir);
    const summaryFile = files.find((file) => file.endsWith('.json'));
    assert.ok(summaryFile !== undefined, 'the command must write one summary file');
    const loaded = await readAssistantResult(join(outDir, summaryFile));
    assert.equal(loaded.summary.kind, 'assistant');
    assert.equal(loaded.summary.door, 'mcp');
    assert.equal(loaded.summary.model, 'deepseek-flash');
    assert.equal(loaded.summary.runs, 2);
    assert.equal(loaded.summary.summary.runs, 2);
    assert.equal(loaded.summary.summary.correct_runs, 2);
    assert.equal(loaded.samples.length, 2);
    assert.equal(new Set(loaded.samples.map((sample) => sample.turn_id)).size, 2);
    assert.ok(loaded.samples.every((sample) => sample.usage_reported));
    assert.ok(loaded.samples.every((sample) => sample.model_calls === 2 && sample.tool_calls === 1));
    assert.ok(loaded.samples.every((sample) => sample.model_ms === 10 && sample.gateway_ms === 12));
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
