import { randomBytes } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PERSONAS } from '@lab/shared';
import { DEFAULT_MAX_STEPS, runConversation } from './conversation.js';
import { DEEPSEEK_MODEL, DeepSeekClient, readModelKey } from './deepseek.js';
import type { DoorContext, DoorFactory, ToolDoor } from './door.js';
import { ASSISTANT_JOBS, findJob, type AssistantJob } from './jobs.js';
import type { ModelClient } from './model.js';
import { writeAssistantResult, type AssistantSample } from './result.js';
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
    if (option.startsWith('-')) throw new Error(`unknown option "${argument}"`);
    throw new Error(`unexpected argument "${argument}"`);
  }

  return { door, job, runs, out, maxSteps, force, help };
}

export function usageText(): string {
  const jobLines = ASSISTANT_JOBS.map((job) => `  ${job.id.padEnd(22)} ${job.label}`).join('\n');
  return [
    'Usage: npm run assistant -- --door <mcp|function> --job <việc> --runs N [--max-steps N] [--out <folder>] [--force]',
    '',
    'Runs one Q2 job through one tool door and writes a result under rd/evaluation/results/.',
    `--runs defaults to ${DEFAULT_RUNS}; --max-steps defaults to ${DEFAULT_MAX_STEPS}.`,
    'The model key is read only from LAB_MODEL_API_KEY; the tool key from LAB_TOOL_KEYS or LAB_TOOL_KEY.',
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

/** Mask key-shaped tokens before an error reaches a log. */
function safeMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/\b(?:lab_|sk-)[A-Za-z0-9_-]{6,}/g, '***');
}

export interface AssistantFactories {
  readonly createModel?: (options: { readonly apiKey: string; readonly model: string }) => ModelClient;
  readonly createDoor?: (name: DoorName, context: DoorContext) => Promise<ToolDoor>;
  readonly createUsage?: (options: { readonly baseUrl: string; readonly apiKey: string }) => UsageReporter;
}

export interface AssistantDependencies extends AssistantFactories {
  readonly env?: NodeJS.ProcessEnv;
  readonly repoRoot?: string;
  readonly log?: (line: string) => void;
  readonly now?: () => Date;
  readonly clock?: () => number;
}

function emptySample(run: number, job: AssistantJob, door: DoorName, turnId: string): AssistantSample {
  return {
    run,
    job: job.id,
    door,
    persona: job.persona,
    turn_id: turnId,
    correct: false,
    grade_reason: 'run_error',
    stop_reason: 'error',
    model_ms: 0,
    gateway_ms: 0,
    total_ms: 0,
    model_calls: 0,
    tool_calls: 0,
    input_tokens: 0,
    output_tokens: 0,
    cost_usd: 0,
    usage_reported: false,
    tools: [],
    reason_codes: [],
  };
}

/**
 * Run one job N times and write the result. Every run is one conversation turn
 * with its own turn code, so the gateway can join the cost to the tool calls.
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
  const nowDate = dependencies.now ?? (() => new Date());
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
    ...(args.force ? ['--force'] : []),
  ].join(' ');

  const samples: AssistantSample[] = [];
  // The door is built once, before any run: a missing door module must fail the
  // command instead of writing a result full of error samples.
  const door = await createDoor(args.door, { baseUrl, employeeId: persona.employeeId, toolKey });
  const usage = createUsage({ baseUrl, apiKey: toolKey });
  for (let run = 1; run <= args.runs; run += 1) {
    const turnId = newTurnId(run);
    log(`[assistant] run ${run}/${args.runs} ${args.door}/${job.id} for ${job.persona}, turn ${turnId}`);
    try {
      const model = createModel({ apiKey: modelKey, model: modelName });
      const outcome = await runConversation({
        job,
        turnId,
        model,
        door,
        usage,
        maxSteps: args.maxSteps,
        now: clock,
        nowDate,
      });
      samples.push({
        run,
        job: job.id,
        door: args.door,
        persona: job.persona,
        turn_id: turnId,
        correct: outcome.verdict.correct,
        grade_reason: outcome.verdict.reason,
        stop_reason: outcome.record.stopReason,
        model_ms: outcome.modelMs,
        gateway_ms: outcome.gatewayMs,
        total_ms: outcome.totalMs,
        model_calls: outcome.modelCalls,
        tool_calls: outcome.toolCalls,
        input_tokens: outcome.usage.inputTokens,
        output_tokens: outcome.usage.outputTokens,
        cost_usd: outcome.turnUsage.costUsd,
        usage_reported: outcome.usageReported,
        tools: outcome.record.toolCalls.map((call) => call.name),
        reason_codes: outcome.record.toolCalls.map((call) => call.reasonCode),
      });
      log(
        `[assistant] run ${run}: ${outcome.verdict.correct ? 'correct' : 'wrong'} (${outcome.verdict.reason}), `
          + `model ${Math.round(outcome.modelMs)} ms, gateway ${Math.round(outcome.gatewayMs)} ms, `
          + `${outcome.usage.inputTokens} in / ${outcome.usage.outputTokens} out tokens, $${outcome.turnUsage.costUsd}`,
      );
    } catch (cause) {
      samples.push(emptySample(run, job, args.door, turnId));
      log(`[assistant] run ${run}: error: ${safeMessage(cause)}`);
    }
  }

  const written = await writeAssistantResult({
    outDir,
    repoRoot,
    command,
    model: modelName,
    door: args.door,
    job,
    runs: args.runs,
    samples,
    force: args.force,
    now: nowDate(),
    notes: [
      `Mô hình: ${modelName}. Cửa: ${args.door}. Mỗi lần chạy là một lượt hội thoại có mã lượt riêng.`,
      'Chi phí báo qua POST /v1/usage; token vào, token ra và tiền lấy từ phản hồi của mô hình.',
      'File mẫu không giữ câu trả lời hay nội dung tool, chỉ giữ số đo và mã lý do.',
      'Kết quả đúng hay sai do hàm chấm của việc quyết định, không do người đọc file.',
    ],
  });

  log(
    `[assistant] ${written.result.summary.correct_runs}/${written.result.summary.runs} correct, `
      + `model p50 ${written.result.summary.model_ms.p50_ms} ms, gateway p50 ${written.result.summary.gateway_ms.p50_ms} ms, `
      + `$${written.result.summary.cost_usd}`,
  );
  log(`[assistant] wrote ${written.shownFile}`);
  // Keep the evidence file of a failed measurement, but exit non-zero so a
  // script notices that no run produced a usable answer.
  return samples.every((sample) => sample.stop_reason === 'error') ? 1 : 0;
}
