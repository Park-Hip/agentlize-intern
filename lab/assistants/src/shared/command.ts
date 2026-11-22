import { randomBytes } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PERSONAS } from '@lab/shared';
import {
  BALANCE_CHECK_EVERY,
  MIN_BALANCE_USD,
  BalanceError,
  DeepSeekBalanceClient,
  type BalanceClient,
} from './balance.js';
import { DEFAULT_MAX_STEPS, runConversation } from './conversation.js';
import { isPeakTime } from './cost.js';
import { DEEPSEEK_MODEL, DeepSeekClient, readModelKey } from './deepseek.js';
import type { DoorContext, DoorFactory, ToolDoor } from './door.js';
import { runErrorCode } from './errors.js';
import {
  FAULT_PLANS,
  buildFaultSummary,
  countProposals,
  createFaultDoor,
  faultModeForRun,
  sampleFaultsOf,
  startFaultServers,
  type FaultPlanName,
} from './faults.js';
import { ASSISTANT_JOBS, LAN_OPEN_TASKS, findJob, type AssistantJob } from './jobs.js';
import type { ModelClient } from './model.js';
import {
  writeAssistantResult,
  type AssistantBalance,
  type AssistantSample,
  type BalanceCheck,
  type SampleFaults,
  type StoppedEarly,
} from './result.js';
import { createGatewayUsageReporter, type UsageReporter } from './usage.js';

export const DOOR_NAMES = ['mcp', 'function'] as const;
export type DoorName = (typeof DOOR_NAMES)[number];

export const DEFAULT_RUNS = 1;
export const MAX_RUNS = 100;
export const MAX_MAX_STEPS = 50;

/** Where the gateway listens by default, the same address `npm start` opens. */
export const GATEWAY_URL_ENV = 'LAB_GATEWAY_URL';
export const DEFAULT_GATEWAY_URL = 'http://127.0.0.1:8790';
/** JSON object mapping a persona name to that person's `lab_` key. */
export const TOOL_KEYS_ENV = 'LAB_TOOL_KEYS';
/** One key for every persona, used when `LAB_TOOL_KEYS` is not set. */
export const TOOL_KEY_ENV = 'LAB_TOOL_KEY';
/** Optional model override; the default is the model chosen in issue #102. */
export const MODEL_NAME_ENV = 'LAB_MODEL_NAME';

const HERE = dirname(fileURLToPath(import.meta.url));
/** `lab/assistants/dist/shared` -> `lab`. */
const LAB_ROOT = resolve(HERE, '..', '..', '..');
/** `lab` -> the repository root. */
const REPO_ROOT = resolve(LAB_ROOT, '..');

export interface ParsedAssistantArguments {
  readonly door: DoorName | null;
  readonly job: string | null;
  readonly runs: number;
  readonly out: string | undefined;
  readonly maxSteps: number;
  readonly force: boolean;
  readonly allowPeak: boolean;
  readonly fault: FaultPlanName | null;
  readonly help: boolean;
}

function readValue(argv: readonly string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${option} needs a value`);
  return value;
}

function isDoorName(value: string): value is DoorName {
  return (DOOR_NAMES as readonly string[]).includes(value);
}

function readPositiveInteger(value: string, option: string, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new Error(`${option} must be a whole number from 1 to ${max}, got "${value}"`);
  }
  return parsed;
}

export function parseAssistantArguments(argv: readonly string[]): ParsedAssistantArguments {
  let door: DoorName | null = null;
  let job: string | null = null;
  let runs = DEFAULT_RUNS;
  let out: string | undefined;
  let maxSteps = DEFAULT_MAX_STEPS;
  let force = false;
  let allowPeak = false;
  let fault: FaultPlanName | null = null;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? '';
    if (argument === '--help' || argument === '-h') {
      help = true;
      continue;
    }

    const [option, inline] = argument.startsWith('--') ? argument.split('=', 2) : [argument, undefined];
    if (option === '--door') {
      const value = inline ?? readValue(argv, index, '--door');
      if (inline === undefined) index += 1;
      if (!isDoorName(value)) throw new Error(`--door must be one of ${DOOR_NAMES.join(', ')}, got "${value}"`);
      door = value;
      continue;
    }
    if (option === '--job') {
      job = inline ?? readValue(argv, index, '--job');
      if (inline === undefined) index += 1;
      if (job.trim() === '') throw new Error('--job must not be empty');
      continue;
    }
    if (option === '--runs') {
      const value = inline ?? readValue(argv, index, '--runs');
      if (inline === undefined) index += 1;
      runs = readPositiveInteger(value, '--runs', MAX_RUNS);
      continue;
    }
    if (option === '--max-steps') {
      const value = inline ?? readValue(argv, index, '--max-steps');
      if (inline === undefined) index += 1;
      maxSteps = readPositiveInteger(value, '--max-steps', MAX_MAX_STEPS);
      continue;
    }
    if (option === '--out') {
      out = inline ?? readValue(argv, index, '--out');
      if (inline === undefined) index += 1;
      if (out.trim() === '') throw new Error('--out must not be empty');
      continue;
    }
    if (option === '--force') {
      if (inline !== undefined) throw new Error('--force takes no value');
      force = true;
      continue;
    }
    if (option === '--allow-peak') {
      if (inline !== undefined) throw new Error('--allow-peak takes no value');
      allowPeak = true;
      continue;
    }
    if (option === '--fault') {
      const value = inline ?? readValue(argv, index, '--fault');
      if (inline === undefined) index += 1;
      if (!(FAULT_PLANS as readonly string[]).includes(value)) {
        throw new Error(`--fault must be one of ${FAULT_PLANS.join(', ')}, got "${value}"`);
      }
      fault = value as FaultPlanName;
      continue;
    }
    if (option.startsWith('-')) throw new Error(`unknown option "${argument}"`);
    throw new Error(`unexpected argument "${argument}"`);
  }

  return { door, job, runs, out, maxSteps, force, allowPeak, fault, help };
}

export function usageText(): string {
  const jobLines = ASSISTANT_JOBS.map((job) => `  ${job.id.padEnd(22)} ${job.label}`).join('\n');
  return [
    'Usage: npm run assistant -- --door <mcp|function> --job <việc> --runs N [--max-steps N] [--out <folder>] [--fault m2] [--force] [--allow-peak]',
    '',
    'Runs one Q2 job through one tool door and writes a result under rd/evaluation/results/.',
    `--runs defaults to ${DEFAULT_RUNS}; --max-steps defaults to ${DEFAULT_MAX_STEPS}.`,
    'The model key is read only from LAB_MODEL_API_KEY; the tool key from LAB_TOOL_KEYS or LAB_TOOL_KEY.',
    `The DeepSeek USD balance is read before the first run and after every ${BALANCE_CHECK_EVERY} runs;`,
    `the command stops when it is under $${MIN_BALANCE_USD.toFixed(2)}.`,
    'DeepSeek charges double from 08:00-11:00 and 13:00-17:00 Vietnam time, Monday to Friday;',
    'the command refuses to start in those windows unless --allow-peak is passed.',
    '--fault m2 injects a network error in runs 1-10 and 12-15 and a timeout in run 11',
    'before the first proposal, then sends the real call again; the result is named with -m2- before the commit.',
    'The mcp and function doors live in src/mcp/ (#108) and src/function-calling/ (#109).',
    '',
    'Jobs:',
    jobLines,
  ].join('\n');
}

/**
 * The typist's own key. `LAB_TOOL_KEYS` maps each persona to a key so one run
 * can use Hoa and the next can use Nam; `LAB_TOOL_KEY` is the single-key
 * fallback. Neither value is ever printed.
 */
export function readToolKey(env: NodeJS.ProcessEnv, persona: string): string {
  const raw = env[TOOL_KEYS_ENV]?.trim();
  if (raw !== undefined && raw !== '') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`${TOOL_KEYS_ENV} must be a JSON object mapping a persona to its key`);
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error(`${TOOL_KEYS_ENV} must be a JSON object mapping a persona to its key`);
    }
    const key = (parsed as Record<string, unknown>)[persona];
    if (typeof key !== 'string' || key.trim() === '') {
      throw new Error(`${TOOL_KEYS_ENV} has no key for persona "${persona}"`);
    }
    return key;
  }

  const single = env[TOOL_KEY_ENV]?.trim();
  if (single === undefined || single === '') {
    throw new Error(`set ${TOOL_KEYS_ENV} (JSON by persona) or ${TOOL_KEY_ENV} before running the assistant`);
  }
  return single;
}

/**
 * Load the door module the command was asked for. The shared kit is ready
 * before the two doors exist, so a missing module names the issue that adds it.
 */
export async function loadDoor(name: DoorName, context: DoorContext): Promise<ToolDoor> {
  const relativeModule = name === 'mcp' ? '../mcp/door.js' : '../function-calling/door.js';
  const url = new URL(relativeModule, import.meta.url).href;
  let loaded: { createDoor?: DoorFactory };
  try {
    loaded = (await import(url)) as { createDoor?: DoorFactory };
  } catch (cause) {
    const issue = name === 'mcp' ? '#108' : '#109';
    throw new Error(`the ${name} door is not built yet (issue ${issue}); the shared kit is ready for it`, { cause });
  }
  if (typeof loaded.createDoor !== 'function') {
    throw new Error(`${relativeModule} must export createDoor(context)`);
  }
  return loaded.createDoor(context);
}

function newTurnId(run: number): string {
  return `turn-${Date.now().toString(36)}-${run}-${randomBytes(4).toString('hex')}`;
}

function balanceErrorCode(error: unknown): string {
  return error instanceof BalanceError ? error.code : 'balance_unavailable';
}

export interface AssistantFactories {
  readonly createModel?: (options: { readonly apiKey: string; readonly model: string }) => ModelClient;
  readonly createDoor?: (name: DoorName, context: DoorContext) => Promise<ToolDoor>;
  readonly createUsage?: (options: { readonly baseUrl: string; readonly apiKey: string }) => UsageReporter;
  readonly createBalance?: (options: { readonly apiKey: string }) => BalanceClient;
}

export interface AssistantDependencies extends AssistantFactories {
  readonly env?: NodeJS.ProcessEnv;
  readonly repoRoot?: string;
  readonly log?: (line: string) => void;
  readonly now?: () => Date;
  readonly clock?: () => number;
  /** The timeout fault's cut; tests shorten it so the suite stays fast. */
  readonly faultTimeoutMs?: number;
}

function emptySample(
  run: number,
  job: AssistantJob,
  door: DoorName,
  turnId: string,
  errorCode: string,
): AssistantSample {
  return {
    run,
    job: job.id,
    door,
    persona: job.persona,
    turn_id: turnId,
    correct: false,
    grade_reason: 'run_error',
    stop_reason: 'error',
    error_code: errorCode,
    model_ms: 0,
    gateway_ms: 0,
    total_ms: 0,
    model_calls: 0,
    tool_calls: 0,
    input_tokens: 0,
    cache_hit_tokens: 0,
    cache_miss_tokens: 0,
    output_tokens: 0,
    cost_usd: 0,
    usage_reported: false,
    tools: [],
    reason_codes: [],
  };
}

function expectedProposalTasks(jobId: string): readonly string[] {
  if (jobId === 'assign-t12-to-minh') return ['T-12'];
  if (jobId === 'reassign-lan-tasks') return LAN_OPEN_TASKS;
  return [];
}

/**
 * Run one job N times and write the result. Every run is one conversation turn
 * with its own turn code, so the gateway can join the cost to the tool calls.
 * The command refuses to start in a peak price window unless `--allow-peak`,
 * and stops when the DeepSeek USD balance falls under the guard.
 */
export async function main(argv: readonly string[], dependencies: AssistantDependencies = {}): Promise<number> {
  const env = dependencies.env ?? process.env;
  const log = dependencies.log ?? ((line: string) => console.log(line));
  const args = parseAssistantArguments(argv);
  if (args.help || args.door === null || args.job === null) {
    console.log(usageText());
    return args.help ? 0 : 1;
  }

  const job = findJob(args.job);
  if (job === undefined) {
    throw new Error(`unknown job "${args.job}"; available: ${ASSISTANT_JOBS.map((candidate) => candidate.id).join(', ')}`);
  }
  const doorName: DoorName = args.door;

  const nowDate = dependencies.now ?? (() => new Date());
  const peak = isPeakTime(nowDate());
  if (peak && !args.allowPeak) {
    throw new Error(
      'DeepSeek charges double from 08:00-11:00 and 13:00-17:00 Vietnam time, Monday to Friday; '
        + 'run outside those windows or pass --allow-peak to run anyway',
    );
  }

  const persona = PERSONAS[job.persona];
  const toolKey = readToolKey(env, job.persona);
  const modelKey = readModelKey(env);
  const modelName = env[MODEL_NAME_ENV]?.trim() || DEEPSEEK_MODEL;
  const baseUrl = env[GATEWAY_URL_ENV]?.trim() || DEFAULT_GATEWAY_URL;
  const repoRoot = dependencies.repoRoot ?? REPO_ROOT;
  const outDir = args.out === undefined ? join(repoRoot, 'rd', 'evaluation', 'results') : resolve(args.out);
  const createModel = dependencies.createModel ?? ((options) => new DeepSeekClient(options));
  const createDoor = dependencies.createDoor ?? loadDoor;
  const createUsage = dependencies.createUsage ?? ((options) => createGatewayUsageReporter(options));
  const createBalance = dependencies.createBalance ?? ((options) => new DeepSeekBalanceClient(options));
  const clock = dependencies.clock ?? (() => performance.now());

  const command = [
    'npm run assistant --',
    '--door',
    args.door,
    '--job',
    args.job,
    '--runs',
    String(args.runs),
    ...(args.maxSteps === DEFAULT_MAX_STEPS ? [] : ['--max-steps', String(args.maxSteps)]),
    ...(args.out === undefined ? [] : ['--out', args.out]),
    ...(args.fault === null ? [] : ['--fault', args.fault]),
    ...(args.force ? ['--force'] : []),
    ...(args.allowPeak ? ['--allow-peak'] : []),
  ].join(' ');

  // The door is built before the balance read, so a missing door module fails
  // the command before it touches the model provider.
  const door = await createDoor(doorName, { baseUrl, employeeId: persona.employeeId, toolKey });
  const usage = createUsage({ baseUrl, apiKey: toolKey });
  const balanceClient = createBalance({ apiKey: modelKey });
  const checks: BalanceCheck[] = [];
  const readBalance = async (afterRun: number): Promise<number> => {
    const usd = await balanceClient.read();
    checks.push({ after_run: afterRun, usd, at: nowDate().toISOString() });
    return usd;
  };

  let balanceBefore: number;
  try {
    balanceBefore = await readBalance(0);
  } catch (cause) {
    // No guard, no run: fail before spending anything.
    throw new Error(`cannot read the DeepSeek balance before the first run (${balanceErrorCode(cause)})`);
  }

  let balanceAfter: number | null = balanceBefore;
  let balanceError: string | null = null;
  let stoppedEarly: StoppedEarly | null = null;
  if (balanceBefore < MIN_BALANCE_USD) {
    stoppedEarly = { reason: 'balance_low', at_run: 0 };
    log(`[assistant] balance $${balanceBefore} is under $${MIN_BALANCE_USD.toFixed(2)}; no run started`);
  }

  const faultServers =
    args.fault === null || stoppedEarly !== null ? null : await startFaultServers();
  const faultedRuns: SampleFaults[] = [];
  const samples: AssistantSample[] = [];
  try {
    for (let run = 1; run <= args.runs && stoppedEarly === null; run += 1) {
      const turnId = newTurnId(run);
      const faultMode = args.fault === null ? 'none' : faultModeForRun(run);
      const faulted =
        args.fault === null || faultServers === null || faultMode === 'none'
          ? null
          : createFaultDoor({
              door,
              mode: faultMode,
              faultUrl: faultMode === 'timeout' ? faultServers.blackHoleUrl : faultServers.refuserUrl,
              createFaultDoor: (url) =>
                createDoor(doorName, { baseUrl: url, employeeId: persona.employeeId, toolKey }),
              ...(dependencies.faultTimeoutMs === undefined
                ? {}
                : { timeoutMs: dependencies.faultTimeoutMs }),
            });
      log(`[assistant] run ${run}/${args.runs} ${doorName}/${job.id} for ${job.persona}, turn ${turnId}`);
      try {
        const model = createModel({ apiKey: modelKey, model: modelName });
        const outcome = await runConversation({
          job,
          turnId,
          model,
          door: faulted?.door ?? door,
          usage,
          maxSteps: args.maxSteps,
          now: clock,
          nowDate,
        });
        const tally = countProposals(outcome.record, expectedProposalTasks(job.id));
        const sampleFault = args.fault === null ? null : sampleFaultsOf(faultMode, faulted?.counters ?? null, tally);
        if (sampleFault !== null) faultedRuns.push(sampleFault);
        samples.push({
          run,
          job: job.id,
          door: doorName,
          persona: job.persona,
          turn_id: turnId,
          correct: outcome.verdict.correct,
          grade_reason: outcome.verdict.reason,
          stop_reason: outcome.record.stopReason,
          error_code: null,
          model_ms: outcome.modelMs,
          gateway_ms: outcome.gatewayMs,
          total_ms: outcome.totalMs,
          model_calls: outcome.modelCalls,
          tool_calls: outcome.toolCalls,
          input_tokens: outcome.usage.inputTokens,
          cache_hit_tokens: outcome.usage.cacheHitTokens,
          cache_miss_tokens: outcome.usage.cacheMissTokens,
          output_tokens: outcome.usage.outputTokens,
          cost_usd: outcome.turnUsage.costUsd,
          usage_reported: outcome.usageReported,
          tools: outcome.record.toolCalls.map((call) => call.name),
          reason_codes: outcome.record.toolCalls.map((call) => call.reasonCode),
          ...(sampleFault === null ? {} : { fault: sampleFault }),
        });
        log(
          `[assistant] run ${run}: ${outcome.verdict.correct ? 'correct' : 'wrong'} (${outcome.verdict.reason}), `
            + `model ${Math.round(outcome.modelMs)} ms, gateway ${Math.round(outcome.gatewayMs)} ms, `
            + `${outcome.usage.inputTokens} in / ${outcome.usage.outputTokens} out tokens, $${outcome.turnUsage.costUsd}`
            + (sampleFault === null
              ? ''
              : `, fault ${sampleFault.mode}: ${sampleFault.network_errors} network, ${sampleFault.timeouts} timeout, ${sampleFault.retries} retry`),
        );
      } catch (cause) {
        const code = runErrorCode(cause);
        const sampleFault =
          args.fault === null
            ? null
            : sampleFaultsOf(faultMode, faulted?.counters ?? null, {
                proposals: 0,
                duplicateTasks: 0,
                incompleteTasks: 0,
              });
        if (sampleFault !== null) faultedRuns.push(sampleFault);
        samples.push({
          ...emptySample(run, job, doorName, turnId, code),
          ...(sampleFault === null ? {} : { fault: sampleFault }),
        });
        log(`[assistant] run ${run}: error (${code})`);
      }

      const isLast = run === args.runs;
      if (run % BALANCE_CHECK_EVERY === 0 || isLast) {
        try {
          const usd = await readBalance(run);
          balanceAfter = usd;
          if (usd < MIN_BALANCE_USD && !isLast) {
            stoppedEarly = { reason: 'balance_low', at_run: run };
            log(`[assistant] balance $${usd} is under $${MIN_BALANCE_USD.toFixed(2)}; stopping before run ${run + 1}`);
          }
        } catch (cause) {
          balanceAfter = null;
          balanceError = balanceErrorCode(cause);
          if (!isLast) {
            stoppedEarly = { reason: 'balance_unavailable', at_run: run };
            log(`[assistant] balance read failed after run ${run} (${balanceError}); stopping`);
          }
        }
      }
    }
  } finally {
    await faultServers?.close();
  }

  const balance: AssistantBalance = {
    threshold_usd: MIN_BALANCE_USD,
    before_usd: balanceBefore,
    after_usd: balanceAfter,
    checks,
    error: balanceError,
  };

  const written = await writeAssistantResult({
    outDir,
    repoRoot,
    command,
    model: modelName,
    door: doorName,
    job,
    runs: args.runs,
    samples,
    peak,
    allowPeak: args.allowPeak,
    balance,
    stoppedEarly,
    force: args.force,
    now: nowDate(),
    ...(args.fault === null ? {} : { fault: buildFaultSummary(faultedRuns, args.fault, dependencies.faultTimeoutMs) }),
    notes: [
      `Mô hình: ${modelName}. Cửa: ${doorName}. Mỗi lần chạy là một lượt hội thoại có mã lượt riêng.`,
      `Số dư DeepSeek đọc trước khi chạy và sau mỗi ${BALANCE_CHECK_EVERY} lượt; ngưỡng dừng ${MIN_BALANCE_USD.toFixed(2)} USD.`,
      `Giờ cao điểm: ${peak ? 'có' : 'không'}${args.allowPeak ? ' (đã cho phép)' : ''}.`,
      'Chi phí báo qua POST /v1/usage; token vào, token ra, token trúng bộ nhớ đệm và tiền lấy từ phản hồi của mô hình.',
      'File mẫu không giữ câu trả lời hay nội dung tool, chỉ giữ số đo, mã lý do và mã lỗi ngắn.',
      'Kết quả đúng hay sai do hàm chấm của việc quyết định, không do người đọc file.',
      ...(args.fault === null
        ? []
        : [
            'Lớp có lỗi M2: lời gọi soạn đề xuất đầu tiên ở lượt 1-10 và 12-15 gặp lỗi mạng, lượt 11 gặp hết giờ, rồi được gửi lại vào cổng thật; lượt 16-20 sạch.',
            'Lỗi được gây ở một cổng cục bộ đóng kết nối ngay hoặc không bao giờ trả lời, nên cổng thật chỉ nhận đúng một lời gọi và mô hình chỉ thấy câu trả lời thật.',
            'Lớp này chỉ soạn đề xuất, không bấm Gửi: ghi trùng và lệnh mất bằng 0 theo thiết kế, còn đề xuất trùng và đề xuất thiếu được đếm thay thế.',
          ]),
    ],
  });

  log(
    `[assistant] ${written.result.summary.correct_runs}/${written.result.summary.runs} correct, `
      + `model p50 ${written.result.summary.model_ms.p50_ms} ms, gateway p50 ${written.result.summary.gateway_ms.p50_ms} ms, `
      + `$${written.result.summary.cost_usd}`,
  );
  if (written.result.fault !== undefined) {
    const fault = written.result.fault;
    log(
      `[assistant] fault ${fault.plan}: ${fault.network_errors} network errors, ${fault.timeouts} timeouts, `
        + `${fault.retries} retries, ${fault.duplicate_proposals} duplicate proposals, `
        + `${fault.incomplete_proposals} incomplete proposals, ${fault.point_missed} point missed`,
    );
  }
  log(`[assistant] wrote ${written.shownFile}`);
  // Keep the evidence file of a stopped or failed measurement, but exit non-zero
  // so a script notices that the requested runs did not all produce an answer.
  if (stoppedEarly !== null) return 1;
  return samples.length > 0 && samples.every((sample) => sample.stop_reason === 'error') ? 1 : 0;
}
