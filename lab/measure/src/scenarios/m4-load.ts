import { performance } from 'node:perf_hooks';
import { PERSONAS, type EmployeeRole } from '@lab/shared';
import { DOORS, type Answer, type Door } from '@lab/tests/doors';
import { safetyCounter } from '../safety.js';
import { roundMs, summarize } from '../stats.js';
import type {
  MeasureContext,
  SafetyCounter,
  Sample,
  Scenario,
  ScenarioResult,
  TargetRequest,
} from '../types.js';

/**
 * M4 compares one caller with ten callers for a fixed window. The window is
 * 60 seconds, as the issue states; `--runs` may shorten it for a smoke run,
 * never lengthen it.
 */
const MAX_SECONDS_PER_LEVEL = 60;
const ONE_X: Level = { label: '1x', door: 'http-1x', callers: 1 };
const TEN_X: Level = { label: '10x', door: 'http-10x', callers: 10 };
const LEVELS: readonly Level[] = [ONE_X, TEN_X];

interface Level {
  /** Short label used in notes and targets. */
  readonly label: string;
  /** Sample door. It also carries the load level so the summary splits the two windows. */
  readonly door: string;
  readonly callers: number;
}

interface CallSpec {
  readonly tool: string;
  readonly args: unknown;
}

interface CallerSpec {
  readonly employeeId: string;
  readonly role: EmployeeRole;
}

interface LevelRun {
  readonly level: Level;
  readonly samples: readonly Sample[];
  readonly errors: number;
  readonly reasonCodes: Readonly<Record<string, number>>;
  readonly elapsedMs: number;
  readonly outOfScopeHits: number;
  readonly scannedFindEmployee: number;
}

const FIND_EMPLOYEE: CallSpec = { tool: 'find_employee', args: { name: 'Minh' } };
const LIST_TASKS: CallSpec = { tool: 'list_tasks', args: { assignee: 'NV-03', status: 'doing' } };
const GET_TASK: CallSpec = { tool: 'get_task', args: { task_id: 'T-12' } };
const PROPOSE_TASK_CHANGE: CallSpec = {
  tool: 'propose_task_change',
  args: { task_ids: ['T-12'], changes: { status: 'done' } },
};

/**
 * One cycle is ten calls in the 3:3:3:1 ratio. The tools are interleaved so a
 * worker does not send three calls of the same tool in a row, and ten workers
 * start at ten different offsets, so the ten callers do not hit one tool at the
 * same moment.
 */
const CALL_CYCLE: readonly CallSpec[] = [
  FIND_EMPLOYEE,
  LIST_TASKS,
  GET_TASK,
  FIND_EMPLOYEE,
  LIST_TASKS,
  GET_TASK,
  FIND_EMPLOYEE,
  LIST_TASKS,
  GET_TASK,
  PROPOSE_TASK_CHANGE,
];

const WARMUP_CALLS: readonly CallSpec[] = [FIND_EMPLOYEE, LIST_TASKS, GET_TASK, PROPOSE_TASK_CHANGE];

/**
 * Ten caller keys. The lab has seven people outside the intern role in
 * Operations: three staff, one HR and three more staff. Interns are left out
 * because the bulk rule denies their proposals after the fifth item, which
 * would turn the propose part of the mix into a refusal at the ten-caller
 * level. The last three entries are a second key for the same person, so every
 * caller still has its own key while every key behaves like a regular staff
 * or HR caller.
 */
const CALLERS: readonly CallerSpec[] = [
  { employeeId: PERSONAS.hoa.employeeId, role: PERSONAS.hoa.role },
  { employeeId: PERSONAS.lan.employeeId, role: PERSONAS.lan.role },
  { employeeId: PERSONAS.minh.employeeId, role: PERSONAS.minh.role },
  { employeeId: PERSONAS.nhung.employeeId, role: PERSONAS.nhung.role },
  { employeeId: 'NV-07', role: 'staff' },
  { employeeId: 'NV-08', role: 'staff' },
  { employeeId: 'NV-10', role: 'staff' },
  { employeeId: PERSONAS.hoa.employeeId, role: PERSONAS.hoa.role },
  { employeeId: PERSONAS.lan.employeeId, role: PERSONAS.lan.role },
  { employeeId: PERSONAS.minh.employeeId, role: PERSONAS.minh.role },
];

/** Values only a reader in HR may see, plus the fake values behind the labels. */
const FORBIDDEN_FOR_NON_HR = [
  'Số điện thoại cá nhân: ',
  'Địa chỉ nhà: ',
  '0900 555',
  'Đường Giả Định',
];

function cycleAt(index: number): CallSpec {
  const spec = CALL_CYCLE[index % CALL_CYCLE.length];
  if (spec === undefined) throw new Error('the call cycle is empty');
  return spec;
}

function callerAt(index: number): CallerSpec {
  const caller = CALLERS[index];
  if (caller === undefined) throw new Error(`no caller key for worker ${index}`);
  return caller;
}

function hasForbiddenFields(text: string): boolean {
  return FORBIDDEN_FOR_NON_HR.some((marker) => text.includes(marker));
}

/** A refusal is an answer, but only these two outcomes count as a successful call in this load mix. */
function isSuccessful(tool: string, answer: Answer): boolean {
  if (answer.status !== 200) return false;
  if (answer.reasonCode === null) return true;
  return tool === 'propose_task_change' && answer.reasonCode === 'NEEDS_APPROVAL';
}

function reasonOf(answer: Answer): string {
  if (answer.reasonCode !== null) return answer.reasonCode;
  return answer.status === 200 ? 'ok' : `HTTP_${answer.status}`;
}

function p95Of(samples: readonly Sample[], metric: 'client_ms' | 'gateway_duration_ms'): number | null {
  const values = samples
    .map((sample) => sample[metric])
    .filter((value): value is number => value !== null);
  return summarize(values)?.p95_ms ?? null;
}

function ratioOf(tenTimes: number | null, oneTime: number | null): number | null {
  if (tenTimes === null || oneTime === null || oneTime === 0) return null;
  return Math.round((tenTimes / oneTime) * 100) / 100;
}

function ratioText(value: number | null): string {
  return value === null ? 'không tính được' : `${String(value)} lần`;
}

function secondsText(run: LevelRun): number {
  return Math.round(run.elapsedMs / 100) / 10;
}

function callsPerSecond(run: LevelRun): number {
  if (run.elapsedMs <= 0) return 0;
  return roundMs(run.samples.length / (run.elapsedMs / 1_000));
}

function reasonText(run: LevelRun): string {
  const entries = Object.entries(run.reasonCodes).sort(([left], [right]) => left.localeCompare(right));
  return entries.length === 0 ? 'không có' : entries.map(([code, count]) => `${code} ${String(count)}`).join(', ');
}

/** Warm one connection per tool before the window starts; these calls are not samples. */
async function warmUp(
  context: MeasureContext,
  door: Door,
  level: Level,
  key: string,
  caller: CallerSpec,
): Promise<{ outOfScopeHits: number; scannedFindEmployee: number }> {
  let outOfScopeHits = 0;
  let scannedFindEmployee = 0;

  for (const spec of WARMUP_CALLS) {
    const answer = await door.call(context.services.gateway, spec.tool, spec.args, key);
    if (!isSuccessful(spec.tool, answer)) {
      throw new Error(
        `warmup ${level.label}/${spec.tool}: expected one successful answer, got status ${answer.status} and reason ${String(answer.reasonCode)}`,
      );
    }
    if (spec.tool === 'find_employee' && caller.role !== 'hr') {
      scannedFindEmployee += 1;
      if (hasForbiddenFields(answer.text)) outOfScopeHits += 1;
    }
  }

  return { outOfScopeHits, scannedFindEmployee };
}

/**
 * Run one load window. Each worker keeps one call in flight at a time and
 * starts the next call as soon as the previous one answers, so the number of
 * in-flight calls stays equal to the number of workers.
 */
async function runLevel(
  context: MeasureContext,
  door: Door,
  level: Level,
  keys: readonly string[],
  durationMs: number,
): Promise<LevelRun> {
  const startedAt = performance.now();
  const deadline = startedAt + durationMs;
  const samples: Sample[] = [];
  const perToolRun = new Map<string, number>();
  const reasonCodes = new Map<string, number>();
  let errors = 0;
  let outOfScopeHits = 0;
  let scannedFindEmployee = 0;

  const record = (spec: CallSpec, caller: CallerSpec, answer: Answer, clientMs: number): void => {
    const runKey = `${level.door}\u0000${spec.tool}`;
    const run = (perToolRun.get(runKey) ?? 0) + 1;
    perToolRun.set(runKey, run);

    samples.push({
      door: level.door,
      tool: spec.tool,
      run,
      client_ms: roundMs(clientMs),
      gateway_duration_ms: null,
      trace_id: answer.traceId,
      status: answer.status,
      reason_code: answer.reasonCode,
    });

    const reason = reasonOf(answer);
    reasonCodes.set(reason, (reasonCodes.get(reason) ?? 0) + 1);
    if (!isSuccessful(spec.tool, answer)) errors += 1;

    if (spec.tool === 'find_employee' && caller.role !== 'hr') {
      scannedFindEmployee += 1;
      if (hasForbiddenFields(answer.text)) outOfScopeHits += 1;
    }
  };

  const worker = async (workerIndex: number): Promise<void> => {
    const caller = callerAt(workerIndex);
    const key = keys[workerIndex];
    if (key === undefined) throw new Error(`no raw key for worker ${workerIndex}`);

    let step = workerIndex % CALL_CYCLE.length;
    while (performance.now() < deadline) {
      const spec = cycleAt(step);
      step += 1;
      const callStartedAt = performance.now();
      let answer: Answer;
      try {
        answer = await door.call(context.services.gateway, spec.tool, spec.args, key);
      } catch {
        answer = { status: 0, text: '', reasonCode: 'CALL_FAILED', traceId: null };
      }
      record(spec, caller, answer, performance.now() - callStartedAt);
    }
  };

  await Promise.all(Array.from({ length: level.callers }, (_, index) => worker(index)));

  return {
    level,
    samples,
    errors,
    reasonCodes: Object.fromEntries(reasonCodes),
    elapsedMs: performance.now() - startedAt,
    outOfScopeHits,
    scannedFindEmployee,
  };
}

/**
 * M4: one caller for 60 seconds, then ten callers at once for 60 seconds,
 * through the ordinary HTTP API. The mix is find_employee, list_tasks and
 * get_task at three calls each for every propose_task_change call. The result
 * carries the per-level p50, p95 and maximum of the gateway's own time and of
 * the client time, the calls per second and the errors; the p95 ratio is
 * reported in `notes` and as two report-only targets.
 */
const scenario: Scenario = {
  name: 'm4-load',
  description:
    'M4: một người gọi rồi mười người gọi cùng lúc trong 60 giây qua API thường, đo p50, p95, lớn nhất, số lời gọi mỗi giây, số lỗi và tỉ lệ p95 gấp 10 so với gấp 1.',
  needs: { stack: true, target: false },

  async run(context: MeasureContext): Promise<ScenarioResult> {
    const durationSeconds = Math.max(1, Math.min(context.runs, MAX_SECONDS_PER_LEVEL));
    const durationMs = durationSeconds * 1_000;

    const httpDoor = DOORS.find((door) => door.name === 'http');
    if (httpDoor === undefined) throw new Error('the http door is missing');

    const keys = CALLERS.map((caller) =>
      context.issueKey({ employeeId: caller.employeeId, caller: 'fc-assistant' }),
    );

    const firstCaller = callerAt(0);
    const firstKey = keys[0];
    if (firstKey === undefined) throw new Error('no raw key for the first caller');

    let outOfScopeHits = 0;
    let scannedFindEmployee = 0;
    const runs: LevelRun[] = [];

    for (const level of LEVELS) {
      const warmup = await warmUp(context, httpDoor, level, firstKey, firstCaller);
      outOfScopeHits += warmup.outOfScopeHits;
      scannedFindEmployee += warmup.scannedFindEmployee;

      context.log(
        `[measure] m4-load: level ${level.label} starts, ${level.callers} caller(s), ${durationSeconds} s`,
      );
      const run = await runLevel(context, httpDoor, level, keys, durationMs);
      outOfScopeHits += run.outOfScopeHits;
      scannedFindEmployee += run.scannedFindEmployee;
      runs.push(run);
      context.log(
        `[measure] m4-load: level ${level.label} done, ${run.samples.length} calls, ${callsPerSecond(run)} calls/s, ${run.errors} errors`,
      );
    }

    const observed = context.observe();
    const traceById = new Map(observed.trace.map((row) => [row.traceId, row]));

    for (const run of runs) {
      for (const sample of run.samples) {
        if (sample.status === 200 && sample.trace_id === null) {
          throw new Error(`${sample.door}/${sample.tool}#${sample.run} answered 200 without a trace code`);
        }
        if (sample.trace_id === null) continue;
        const row = traceById.get(sample.trace_id);
        if (row === undefined) {
          throw new Error(`${sample.door}/${sample.tool}#${sample.run} has no trace line`);
        }
        if (row.entry !== 'http' || row.tool !== sample.tool) {
          throw new Error(
            `${sample.door}/${sample.tool}#${sample.run} trace says entry=${row.entry}, tool=${row.tool}`,
          );
        }
        sample.gateway_duration_ms = row.durationMs;
      }
    }

    const forbiddenInTrace = [
      ...Object.values(PERSONAS).map((persona) => persona.fullName),
      '0900 555',
      'Đường Giả Định',
      '@lab.example',
      ...keys,
      context.serviceKey,
    ];
    const personalTraceHits = observed.trace.filter((row) => {
      const text = JSON.stringify(row);
      return forbiddenInTrace.some((marker) => text.includes(marker));
    }).length;

    const one = runs[0];
    const ten = runs[1];
    if (one === undefined || ten === undefined) throw new Error('both load levels must run');

    const oneGateway = p95Of(one.samples, 'gateway_duration_ms');
    const tenGateway = p95Of(ten.samples, 'gateway_duration_ms');
    const oneClient = p95Of(one.samples, 'client_ms');
    const tenClient = p95Of(ten.samples, 'client_ms');
    const gatewayRatio = ratioOf(tenGateway, oneGateway);
    const clientRatio = ratioOf(tenClient, oneClient);

    const counters: SafetyCounter[] = [
      safetyCounter(
        'duplicate_writes',
        false,
        null,
        'Phép đo chỉ soạn đề xuất, không bấm Gửi, nên không có lệnh ghi nào để gửi hai lần.',
      ),
      safetyCounter(
        'lost_commands',
        false,
        null,
        'Không có lệnh ghi nào được tạo, nên không có lệnh nào bị mất.',
      ),
      safetyCounter(
        'unauthorized_writes',
        true,
        observed.writeCommands,
        observed.writeCommands === 0
          ? 'Bảng write_commands rỗng sau phép đo, nên không có lệnh ghi nào chạm hệ thống giả.'
          : `Bảng write_commands có ${observed.writeCommands} dòng sau một phép đo chỉ soạn đề xuất.`,
      ),
      safetyCounter(
        'out_of_scope_fields',
        true,
        outOfScopeHits,
        `Đã quét ${scannedFindEmployee} câu trả lời find_employee của người gọi không thuộc vai nhân sự; ${outOfScopeHits} câu chứa số điện thoại cá nhân hoặc địa chỉ nhà.`,
      ),
      safetyCounter(
        'personal_data_in_trace',
        true,
        personalTraceHits,
        `Đã quét ${observed.trace.length} dòng vết cho tên, email công việc, số điện thoại, địa chỉ nhà và khoá của phép đo; ${personalTraceHits} dòng chứa.`,
      ),
    ];

    const targets: TargetRequest[] = [];
    if (oneGateway !== null && oneGateway > 0 && tenGateway !== null) {
      targets.push({
        id: 'm4-load-gateway-p95-ratio-2x',
        description: `p95 thời gian cổng ở mức gấp 10 không quá 2 lần p95 ở mức gấp 1 (${String(oneGateway)} ms); chỉ báo, không làm lệnh thất bại.`,
        metric: 'gateway_duration_ms',
        threshold_ms: roundMs(oneGateway * 2),
        scope: { kind: 'door', door: ten.level.door },
        enforced: false,
      });
    }
    if (oneClient !== null && oneClient > 0 && tenClient !== null) {
      targets.push({
        id: 'm4-load-client-p95-ratio-2x',
        description: `p95 thời gian phía client ở mức gấp 10 không quá 2 lần p95 ở mức gấp 1 (${String(oneClient)} ms); chỉ báo, không làm lệnh thất bại.`,
        metric: 'client_ms',
        threshold_ms: roundMs(oneClient * 2),
        scope: { kind: 'door', door: ten.level.door },
        enforced: false,
      });
    }

    return {
      samples: runs.flatMap((run) => run.samples),
      safety: counters,
      targets,
      notes: [
        `Mức gấp 1: ${one.samples.length} lời gọi trong ${String(secondsText(one))} giây, ${String(callsPerSecond(one))} lời gọi/giây, ${one.errors} lỗi; mã lý do: ${reasonText(one)}.`,
        `Mức gấp 10: ${ten.samples.length} lời gọi trong ${String(secondsText(ten))} giây, ${String(callsPerSecond(ten))} lời gọi/giây, ${ten.errors} lỗi; mã lý do: ${reasonText(ten)}.`,
        `Tỉ lệ p95 gấp 10 so với gấp 1: cổng ${ratioText(gatewayRatio)}, phía client ${ratioText(clientRatio)}. Mục tiêu không quá 2 lần chỉ để báo, không làm lệnh thất bại.`,
        `Thời lượng mỗi mức là ${String(durationSeconds)} giây. --runs chỉ rút ngắn thời lượng khi nhỏ hơn ${String(MAX_SECONDS_PER_LEVEL)}; mặc định 100 nghĩa là chạy đủ ${String(MAX_SECONDS_PER_LEVEL)} giây, không phải 100 lời gọi cho mỗi tool.`,
        'Mỗi người gọi có một khoá riêng. Bảy người ngoài vai thực tập sinh ở phòng Vận hành giữ mười khoá; ba người trong số đó có thêm một khoá thứ hai. Nhờ vậy mọi đề xuất đều đi qua đúng một nhánh quyền, không có lời gọi nào bị từ chối vì ngưỡng hàng loạt của vai thực tập sinh.',
        'Sau ngưỡng hàng loạt, propose_task_change trả NEEDS_APPROVAL. Đó vẫn là câu trả lời thành công và được tính là một mẫu; không có đề xuất nào được bấm Gửi.',
      ],
      parameters: {
        duration_seconds_per_level: durationSeconds,
        cli_runs: context.runs,
        levels: LEVELS.map((level) => ({ label: level.label, callers: level.callers, door: level.door })),
        tool_mix: { find_employee: 3, list_tasks: 3, get_task: 3, propose_task_change: 1 },
        call_cycle: CALL_CYCLE.map((spec) => spec.tool),
        arguments: {
          find_employee: FIND_EMPLOYEE.args,
          list_tasks: LIST_TASKS.args,
          get_task: GET_TASK.args,
          propose_task_change: PROPOSE_TASK_CHANGE.args,
        },
        key_holders: CALLERS.map((caller) => ({ employee_id: caller.employeeId, role: caller.role })),
        warmup_calls_per_level: WARMUP_CALLS.length,
        gateway_duration_source: 'trace.duration_ms',
        client_duration_source: 'performance.now around Door.call through the http door',
        door_note:
          'Hai nhãn http-1x và http-10x cùng đi qua cửa http; nhãn mang mức tải để phần tóm tắt tách được hai cửa sổ.',
        success_rule:
          'status 200, reason_code null; riêng propose_task_change chấp nhận NEEDS_APPROVAL. Mọi mã khác và lỗi mạng đều là một lỗi.',
        error_rule:
          'Lỗi đếm theo lời gọi: status khác 200, mã lý do ngoài ok và NEEDS_APPROVAL, hoặc fetch ném lỗi (status 0, CALL_FAILED).',
      },
    };
  },
};

export default scenario;
