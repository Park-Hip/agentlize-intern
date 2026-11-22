import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { BalanceError, createFakeBalance } from './balance.js';
import {
  main,
  parseAssistantArguments,
  readToolKey,
  TOOL_KEYS_ENV,
  TOOL_KEY_ENV,
  type AssistantDependencies,
} from './command.js';
import { ModelHttpError, ModelTimeoutError } from './errors.js';
import { TOOL_SPECS, createFakeModel, createScriptedDoor } from './fake-model.js';
import { readAssistantResult, type AssistantResult, type AssistantSample } from './result.js';
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

const OFF_PEAK = (): Date => new Date('2026-11-22T00:00:00Z');
const PEAK = (): Date => new Date('2026-11-23T02:00:00Z');

function findMinhModel() {
  return createFakeModel({
    steps: [
      { toolCalls: [{ name: 'find_employee', arguments: { name: 'Minh' } }] },
      { text: 'Anh Minh là Vũ Quốc Minh (NV-04). Số điện thoại cá nhân không hiện theo quyền của bạn.' },
    ],
  });
}

function baseDeps(overrides: Partial<AssistantDependencies> = {}): AssistantDependencies {
  let tick = 0;
  return {
    env: {
      LAB_MODEL_API_KEY: 'model-key-for-tests',
      [TOOL_KEYS_ENV]: JSON.stringify({ hoa: 'lab_test_hoa', nam: 'lab_test_nam' }),
    },
    repoRoot: REPO_ROOT,
    log: () => {},
    now: OFF_PEAK,
    clock: () => {
      tick += 5;
      return tick;
    },
    createModel: findMinhModel,
    createDoor: async () => createScriptedDoor(() => ({ text: FIND_MINH_TEXT })).door,
    createUsage: () => ({
      async report() {
        return { reported: true, status: 200 };
      },
    }),
    createBalance: () => createFakeBalance([1, 0.9]),
    ...overrides,
  };
}

async function withTemp(run: (outDir: string) => Promise<void>): Promise<void> {
  const outDir = await mkdtemp(join(tmpdir(), 'lab-assistant-command-'));
  try {
    await run(outDir);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
}

async function readOne(outDir: string): Promise<{ result: AssistantResult; samples: readonly AssistantSample[] }> {
  const files = await readdir(outDir);
  const summaryFile = files.find((file) => file.endsWith('.json'));
  assert.ok(summaryFile !== undefined, 'the command must write one summary file');
  const loaded = await readAssistantResult(join(outDir, summaryFile));
  return { result: loaded.summary, samples: loaded.samples };
}

test('command: arguments parse into one door, one job and a bounded run count', () => {
  assert.deepEqual(parseAssistantArguments(['--door', 'mcp', '--job', 'lookup-minh-phone', '--runs', '2']), {
    door: 'mcp',
    job: 'lookup-minh-phone',
    runs: 2,
    out: undefined,
    maxSteps: 8,
    force: false,
    allowPeak: false,
    help: false,
  });
  assert.equal(parseAssistantArguments(['--door=function', '--job=nam-assign-t12']).door, 'function');
  assert.equal(parseAssistantArguments(['--allow-peak']).allowPeak, true);
  assert.equal(parseAssistantArguments(['--help']).help, true);
  assert.throws(() => parseAssistantArguments(['--door', 'nope', '--job', 'x']), /--door must be one of/);
  assert.throws(() => parseAssistantArguments(['--door', 'mcp', '--job', 'x', '--runs', '0']), /--runs/);
  assert.throws(() => parseAssistantArguments(['--door', 'mcp', '--job', 'x', '--max-steps', '51']), /--max-steps/);
  assert.throws(() => parseAssistantArguments(['--allow-peak=1']), /--allow-peak takes no value/);
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

test('command: one run of a job writes the model, gateway, token and balance record', async () => {
  await withTemp(async (outDir) => {
    const reports: TurnUsage[] = [];
    const deps = baseDeps({
      createUsage: () => ({
        async report(usage) {
          reports.push(usage);
          return { reported: true, status: 200 };
        },
      }),
    });

    const code = await main(
      ['--door', 'mcp', '--job', 'lookup-minh-phone', '--runs', '2', '--out', outDir],
      deps,
    );
    assert.equal(code, 0);
    assert.equal(reports.length, 2);

    const loaded = await readOne(outDir);
    assert.equal(loaded.result.kind, 'assistant');
    assert.equal(loaded.result.door, 'mcp');
    assert.equal(loaded.result.model, 'deepseek-flash');
    assert.equal(loaded.result.peak, false);
    assert.equal(loaded.result.allow_peak, false);
    assert.equal(loaded.result.runs, 2);
    assert.equal(loaded.result.summary.runs, 2);
    assert.equal(loaded.result.summary.correct_runs, 2);
    assert.equal(loaded.result.balance.threshold_usd, 0.2);
    assert.equal(loaded.result.balance.before_usd, 1);
    assert.equal(loaded.result.balance.after_usd, 0.9);
    assert.equal(loaded.result.balance.checks.length, 2);
    assert.equal(loaded.result.balance.error, null);
    assert.equal(loaded.result.stopped_early, null);
    assert.equal(loaded.samples.length, 2);
    assert.equal(new Set(loaded.samples.map((sample) => sample.turn_id)).size, 2);
    assert.ok(loaded.samples.every((sample) => sample.usage_reported));
    assert.ok(loaded.samples.every((sample) => sample.error_code === null));
    assert.ok(loaded.samples.every((sample) => sample.model_calls === 2 && sample.tool_calls === 1));
    assert.ok(loaded.samples.every((sample) => sample.model_ms === 10 && sample.gateway_ms === 12));
    assert.ok(loaded.samples.every((sample) => sample.cache_hit_tokens === 192 && sample.cache_miss_tokens === 48));
    assert.equal(loaded.result.summary.cache_hit_tokens, 384);
    assert.equal(loaded.result.summary.cache_miss_tokens, 96);
  });
});

test('command: a peak window refuses to start unless --allow-peak is passed', async () => {
  let doorCreated = false;
  const deps = baseDeps({
    now: PEAK,
    createDoor: async () => {
      doorCreated = true;
      return createScriptedDoor(() => ({ text: FIND_MINH_TEXT })).door;
    },
  });

  await assert.rejects(
    main(['--door', 'mcp', '--job', 'lookup-minh-phone', '--runs', '1'], deps),
    /--allow-peak/,
  );
  assert.equal(doorCreated, false, 'a refused peak run must not build the door');

  await withTemp(async (outDir) => {
    const code = await main(
      ['--door', 'mcp', '--job', 'lookup-minh-phone', '--runs', '1', '--out', outDir, '--allow-peak'],
      deps,
    );
    assert.equal(code, 0);
    const loaded = await readOne(outDir);
    assert.equal(loaded.result.peak, true);
    assert.equal(loaded.result.allow_peak, true);
    assert.match(loaded.result.command, /--allow-peak/);
  });
});

test('command: a balance under 0.20 before the first run stops with no samples', async () => {
  await withTemp(async (outDir) => {
    let modelCreated = false;
    const deps = baseDeps({
      createBalance: () => createFakeBalance([0.1]),
      createModel: () => {
        modelCreated = true;
        return findMinhModel();
      },
    });

    const code = await main(
      ['--door', 'mcp', '--job', 'lookup-minh-phone', '--runs', '3', '--out', outDir],
      deps,
    );
    assert.equal(code, 1);
    assert.equal(modelCreated, false, 'no run may start below the guard');

    const loaded = await readOne(outDir);
    assert.equal(loaded.result.runs, 3);
    assert.equal(loaded.result.summary.runs, 0);
    assert.equal(loaded.samples.length, 0);
    assert.equal(loaded.result.balance.before_usd, 0.1);
    assert.equal(loaded.result.balance.after_usd, 0.1);
    assert.equal(loaded.result.balance.checks.length, 1);
    assert.deepEqual(loaded.result.stopped_early, { reason: 'balance_low', at_run: 0 });
  });
});

test('command: a balance exactly at 0.20 still runs, because the guard stops only under it', async () => {
  await withTemp(async (outDir) => {
    const deps = baseDeps({ createBalance: () => createFakeBalance([0.2]) });

    const code = await main(
      ['--door', 'mcp', '--job', 'lookup-minh-phone', '--runs', '1', '--out', outDir],
      deps,
    );
    assert.equal(code, 0);

    const loaded = await readOne(outDir);
    assert.equal(loaded.result.summary.runs, 1);
    assert.equal(loaded.result.stopped_early, null);
    assert.equal(loaded.result.balance.before_usd, 0.2);
    assert.equal(loaded.result.balance.after_usd, 0.2);
  });
});

test('command: the balance is checked after ten runs and stops before the next one', async () => {
  await withTemp(async (outDir) => {
    const deps = baseDeps({ createBalance: () => createFakeBalance([1, 0.19]) });

    const code = await main(
      ['--door', 'mcp', '--job', 'lookup-minh-phone', '--runs', '12', '--out', outDir],
      deps,
    );
    assert.equal(code, 1);

    const loaded = await readOne(outDir);
    assert.equal(loaded.result.runs, 12);
    assert.equal(loaded.result.summary.runs, 10);
    assert.equal(loaded.samples.length, 10);
    assert.equal(loaded.result.balance.before_usd, 1);
    assert.equal(loaded.result.balance.after_usd, 0.19);
    assert.deepEqual(loaded.result.balance.checks.map((check) => check.after_run), [0, 10]);
    assert.deepEqual(loaded.result.stopped_early, { reason: 'balance_low', at_run: 10 });
  });
});

test('command: an unreadable balance after ten runs stops with a safe code', async () => {
  await withTemp(async (outDir) => {
    const deps = baseDeps({
      createBalance: () => createFakeBalance([1, new BalanceError('balance_unavailable')]),
    });

    const code = await main(
      ['--door', 'mcp', '--job', 'lookup-minh-phone', '--runs', '12', '--out', outDir],
      deps,
    );
    assert.equal(code, 1);

    const loaded = await readOne(outDir);
    assert.equal(loaded.result.summary.runs, 10);
    assert.equal(loaded.result.balance.after_usd, null);
    assert.equal(loaded.result.balance.error, 'balance_unavailable');
    assert.deepEqual(loaded.result.stopped_early, { reason: 'balance_unavailable', at_run: 10 });
  });
});

test('command: a failed run keeps a short error code and never the message', async () => {
  await withTemp(async (outDir) => {
    const deps = baseDeps({
      createModel: () => ({
        name: 'failing-model',
        async complete() {
          throw new ModelHttpError(402);
        },
      }),
    });

    const code = await main(
      ['--door', 'mcp', '--job', 'lookup-minh-phone', '--runs', '1', '--out', outDir],
      deps,
    );
    assert.equal(code, 1);

    const loaded = await readOne(outDir);
    const sample = loaded.samples[0];
    assert.ok(sample !== undefined);
    assert.equal(sample.stop_reason, 'error');
    assert.equal(sample.grade_reason, 'run_error');
    assert.equal(sample.error_code, 'model_http_402');
    assert.equal(JSON.stringify(sample).includes('DeepSeek answered'), false);
  });
});

test('command: a timeout and a door failure get their own safe codes', async () => {
  await withTemp(async (outDir) => {
    const timeoutDeps = baseDeps({
      createModel: () => ({
        name: 'slow-model',
        async complete() {
          throw new ModelTimeoutError();
        },
      }),
    });
    await main(
      ['--door', 'mcp', '--job', 'lookup-minh-phone', '--runs', '1', '--out', outDir, '--force'],
      timeoutDeps,
    );
    assert.equal((await readOne(outDir)).samples[0]?.error_code, 'model_timeout');
  });

  await withTemp(async (outDir) => {
    const doorDeps = baseDeps({
      createModel: () =>
        createFakeModel({
          steps: [{ toolCalls: [{ name: 'find_employee', arguments: { name: 'Minh' } }] }],
        }),
      createDoor: async () => ({
        name: 'mcp',
        async listTools() {
          return TOOL_SPECS;
        },
        async callTool() {
          throw new Error('door down');
        },
      }),
    });
    await main(
      ['--door', 'mcp', '--job', 'lookup-minh-phone', '--runs', '1', '--out', outDir],
      doorDeps,
    );
    assert.equal((await readOne(outDir)).samples[0]?.error_code, 'door_error');
  });
});
