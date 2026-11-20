import { createServer as createNetServer, type Socket } from 'node:net';
import { performance } from 'node:perf_hooks';
import { LOOPBACK_HOST } from '@lab/shared';
import { DOORS, type Door } from '@lab/tests/doors';
import { freePorts } from '@lab/tests/process';
import { safetyCounter } from '../safety.js';
import { roundMs } from '../stats.js';
import {
  DEFAULT_TARGET,
  TARGET_ENV,
  createTarget,
  proposalDraftOf,
  resolveTargetName,
  type DraftFunction,
  type TargetName,
  type WriteTarget,
} from '../targets/index.js';
import { verifySnapshots, waitForSettled, waitForWrite } from '../targets/verify.js';
import type { TargetFault } from '../targets/types.js';
import type { MeasureContext, SafetyCounter, Sample, Scenario, ScenarioResult } from '../types.js';

const TASK_IDS = Array.from({ length: 30 }, (_, index) => `T-${index + 5}`);
const CHANGES = { assignee: 'NV-04' } as const;
const HOST_TIMEOUT_MS = 60_000;
const M2_OUTAGE_MS = 2_000;
const HOLD_AFTER_MS = 60_000;
const WRITE_WAIT_MS = 30_000;
const SETTLE_WAIT_MS = 60_000;
const OUTAGE_WAIT_MS = 60_000;

interface ScenarioSpec {
  readonly name: string;
  readonly taskIds: readonly string[];
}

const SPECS: readonly ScenarioSpec[] = [
  { name: 'a-one-task', taskIds: ['T-12'] },
  { name: 'c-thirty-tasks', taskIds: TASK_IDS },
];

type DraftFault = 'none' | 'network' | 'timeout';
type WriteFault = 'none' | 'drop' | 'outage';

interface FaultPlan {
  readonly draft: DraftFault;
  readonly write: WriteFault;
  readonly outagePosition: number;
}

interface Counts {
  runs: number;
  correct: number;
  incorrect: number;
  errors: number;
  timeouts: number;
  draft_retries: number;
  write_retries: number;
  duplicates: number;
  lost: number;
  wrong_content: number;
  point_missed: number;
  unauthorized: number;
  restarts: number;
  trace_runs: number;
  trace_rows: number;
  trace_leaks: number;
}

interface RunResult {
  correct: boolean;
  reason: string;
  duplicates: number;
  lost: number;
  wrong: number;
  errors: number;
  timeouts: number;
  draftRetries: number;
  writeRetries: number;
  unauthorized: number;
  pointMissed: boolean;
  restarts: number;
  scanned: boolean;
  traceRows: number;
  traceLeaks: number;
}

interface SocketServer {
  readonly url: string;
  close(): Promise<void>;
}

function emptyCounts(): Counts {
  return {
    runs: 0,
    correct: 0,
    incorrect: 0,
    errors: 0,
    timeouts: 0,
    draft_retries: 0,
    write_retries: 0,
    duplicates: 0,
    lost: 0,
    wrong_content: 0,
    point_missed: 0,
    unauthorized: 0,
    restarts: 0,
    trace_runs: 0,
    trace_rows: 0,
    trace_leaks: 0,
  };
}

function addResult(counts: Counts, result: RunResult): void {
  counts.runs += 1;
  if (result.correct) counts.correct += 1;
  else counts.incorrect += 1;
  counts.errors += result.errors;
  counts.timeouts += result.timeouts;
  counts.draft_retries += result.draftRetries;
  counts.write_retries += result.writeRetries;
  counts.duplicates += result.duplicates;
  counts.lost += result.lost;
  counts.wrong_content += result.wrong;
  if (result.pointMissed) counts.point_missed += 1;
  counts.unauthorized += result.unauthorized;
  counts.restarts += result.restarts;
  if (result.scanned) {
    counts.trace_runs += 1;
    counts.trace_rows += result.traceRows;
    counts.trace_leaks += result.traceLeaks;
  }
}

function mergeCounts(...parts: readonly Counts[]): Counts {
  const merged = emptyCounts();
  for (const part of parts) {
    merged.runs += part.runs;
    merged.correct += part.correct;
    merged.incorrect += part.incorrect;
    merged.errors += part.errors;
    merged.timeouts += part.timeouts;
    merged.draft_retries += part.draft_retries;
    merged.write_retries += part.write_retries;
    merged.duplicates += part.duplicates;
    merged.lost += part.lost;
    merged.wrong_content += part.wrong_content;
    merged.point_missed += part.point_missed;
    merged.unauthorized += part.unauthorized;
    merged.restarts += part.restarts;
    merged.trace_runs += part.trace_runs;
    merged.trace_rows += part.trace_rows;
    merged.trace_leaks += part.trace_leaks;
  }
  return merged;
}

function timeoutRunsFromEnv(): number {
  const raw = process.env['LAB_M2_TIMEOUT_RUNS'];
  if (raw === undefined || raw.trim() === '') return 1;
  const value = Number(raw);
  if (value !== 0 && value !== 1) {
    throw new Error(`LAB_M2_TIMEOUT_RUNS must be 0 or 1, got "${raw}"`);
  }
  return value;
}

function planFor(taskCount: number, doorName: string, run: number, timeoutRuns: number): FaultPlan {
  const outagePosition = taskCount === 1 ? 1 : 15;
  if (run <= 10) return { draft: 'network', write: 'none', outagePosition };
  if (run === 11 && doorName === 'tho-than-host' && timeoutRuns > 0) {
    return { draft: 'timeout', write: 'none', outagePosition };
  }
  if (run <= 15) return { draft: 'network', write: 'none', outagePosition };
  if (run <= 25) return { draft: 'none', write: 'drop', outagePosition };
  if (run <= 30) return { draft: 'none', write: 'outage', outagePosition };
  return { draft: 'none', write: 'none', outagePosition };
}

function runKindOf(plan: FaultPlan): string {
  if (plan.draft !== 'none') return `draft-${plan.draft}`;
  if (plan.write !== 'none') return `write-${plan.write}`;
  return 'clean';
}

function failureReason(result: Omit<RunResult, 'reason'>, plan: FaultPlan): string {
  if (result.pointMissed) return 'POINT_MISSED';
  if (result.duplicates > 0) return 'DUPLICATE_WRITE';
  if (result.lost > 0) return 'LOST_COMMAND';
  if (result.wrong > 0) return 'WRONG_CONTENT';
  if (result.unauthorized > 0) return 'UNAUTHORIZED_WRITE';
  if (!result.correct) return 'INCOMPLETE';
  if (plan.draft === 'timeout') return 'OK_AFTER_TIMEOUT';
  if (plan.draft === 'network') return 'OK_AFTER_NETWORK_ERROR';
  if (plan.write !== 'none') return 'OK_AFTER_WRITE_RETRY';
  return 'OK';
}

async function startSocketServer(onSocket: (socket: Socket) => void): Promise<SocketServer> {
  const ports = await freePorts(1);
  const port = ports[0];
  if (port === undefined) throw new Error('could not reserve a loopback port for the fault server');

  const sockets = new Set<Socket>();
  const server = createNetServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => sockets.delete(socket));
    onSocket(socket);
  });
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(port, LOOPBACK_HOST, () => {
      server.off('error', rejectListen);
      resolveListen();
    });
  });

  let closed = false;
  return {
    url: `http://${LOOPBACK_HOST}:${port}`,
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    },
  };
}

/** A port that accepts the connection and closes it at once: a network error the client can retry. */
function startRefuser(): Promise<SocketServer> {
  return startSocketServer((socket) => socket.destroy());
}

/** A port that accepts the connection and never answers, so the fake host gives up at its 60 second cut. */
function startBlackHole(): Promise<SocketServer> {
  return startSocketServer(() => {
    // Keep the socket open and silent.
  });
}

interface AttemptCounters {
  errors: number;
  timeouts: number;
  retries: number;
}

function draftThrough(
  door: Door,
  plan: FaultPlan,
  faultUrl: string,
  blackHole: SocketServer | undefined,
  counters: AttemptCounters,
): DraftFunction {
  return async (context, taskIds, changes) => {
    if (plan.draft !== 'none') {
      const base = plan.draft === 'timeout' ? blackHole?.url : faultUrl;
      if (base === undefined) throw new Error('the timeout run has no silent server');
      try {
        await door.call(base, 'propose_task_change', { task_ids: taskIds, changes }, context.key);
      } catch {
        counters.errors += 1;
        if (plan.draft === 'timeout') counters.timeouts += 1;
        counters.retries += 1;
      }
    }

    const answer = await door.call(
      context.gateway,
      'propose_task_change',
      { task_ids: taskIds, changes },
      context.key,
    );
    return proposalDraftOf(answer);
  };
}

async function runOne(options: {
  readonly target: WriteTarget;
  readonly spec: ScenarioSpec;
  readonly door: Door;
  readonly plan: FaultPlan;
  readonly faultUrl: string;
}): Promise<RunResult> {
  const { target, spec, door, plan, faultUrl } = options;
  const attempts: AttemptCounters = { errors: 0, timeouts: 0, retries: 0 };
  const blackHole = plan.draft === 'timeout' ? await startBlackHole() : undefined;

  try {
    const draft = draftThrough(door, plan, faultUrl, blackHole, attempts);
    const fault: TargetFault | undefined =
      plan.write === 'drop'
        ? { kind: 'drop-answer-after-commit', count: 1 }
        : plan.write === 'outage'
          ? { kind: 'hold-after-commit', position: plan.outagePosition, delayMs: HOLD_AFTER_MS }
          : undefined;
    const proposal = await target.sendProposal({
      taskIds: spec.taskIds,
      changes: CHANGES,
      draft,
      ...(fault === undefined ? {} : { fault }),
    });

    if (plan.write === 'outage') {
      const watched = spec.taskIds[plan.outagePosition - 1];
      if (watched === undefined) throw new Error(`no task at position ${plan.outagePosition}`);
      await waitForWrite(target, watched, 1, WRITE_WAIT_MS);
      await target.outageTasks(M2_OUTAGE_MS);
    }

    await waitForSettled(
      target,
      proposal.proposalId,
      spec.taskIds.length === 1 ? SETTLE_WAIT_MS : OUTAGE_WAIT_MS,
    );

    const final = await target.history(spec.taskIds);
    const check = verifySnapshots(proposal.baseline, final, CHANGES);
    const observation = target.observe();
    const writeRetries = observation.trace.filter((row) => row.ruleId === 'WRITE.RETRY').length;
    const scan = target.scanTrace();

    const draftFaultSeen = plan.draft === 'none' || attempts.errors === 1;
    const dropFaultSeen = plan.write !== 'drop' || writeRetries > 0;
    const outageFaultSeen = plan.write !== 'outage' || writeRetries > 0;
    const pointMissed = !draftFaultSeen || !dropFaultSeen || !outageFaultSeen;
    const correct =
      !pointMissed &&
      check.duplicates === 0 &&
      check.lost === 0 &&
      check.wrong === 0 &&
      proposal.writesBeforeApproval === 0 &&
      observation.writeCommands === spec.taskIds.length;

    const result = {
      correct,
      duplicates: check.duplicates,
      lost: check.lost,
      wrong: check.wrong,
      errors: attempts.errors,
      timeouts: attempts.timeouts,
      draftRetries: attempts.retries,
      writeRetries,
      unauthorized: proposal.writesBeforeApproval,
      pointMissed,
      restarts: target.restarts,
      scanned: true,
      traceRows: scan.rows,
      traceLeaks: scan.hits,
    };
    return { ...result, reason: failureReason(result, plan) };
  } finally {
    if (blackHole !== undefined) await blackHole.close();
  }
}

interface GroupOutcome {
  readonly spec: ScenarioSpec;
  readonly door: Door;
  readonly samples: readonly Sample[];
  readonly counts: Counts;
  readonly byRunKind: Readonly<Record<string, Counts>>;
}

async function measureGroup(options: {
  readonly context: MeasureContext;
  readonly targetName: TargetName;
  readonly spec: ScenarioSpec;
  readonly door: Door;
  readonly runs: number;
  readonly timeoutRuns: number;
}): Promise<GroupOutcome> {
  const samples: Sample[] = [];
  const counts = emptyCounts();
  const byRunKind: Record<string, Counts> = {};
  const refuser = await startRefuser();

  try {
    for (let run = 1; run <= options.runs; run += 1) {
      const plan = planFor(options.spec.taskIds.length, options.door.name, run, options.timeoutRuns);
      const kind = runKindOf(plan);
      const bucket = byRunKind[kind] ?? emptyCounts();
      byRunKind[kind] = bucket;

      const startedAt = performance.now();
      const target = createTarget(options.targetName);
      let result: RunResult;
      try {
        await target.build();
        result = await runOne({
          target,
          spec: options.spec,
          door: options.door,
          plan,
          faultUrl: refuser.url,
        });
      } catch (error) {
        result = {
          correct: false,
          reason: 'ERROR',
          duplicates: 0,
          lost: 0,
          wrong: 0,
          errors: 1,
          timeouts: 0,
          draftRetries: 0,
          writeRetries: 0,
          unauthorized: 0,
          pointMissed: false,
          restarts: target.restarts,
          scanned: false,
          traceRows: 0,
          traceLeaks: 0,
        };
        options.context.log(
          `[measure] ${options.spec.name}/${options.door.name} run ${run}: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        try {
          await target.close();
        } catch {
          // A cleanup failure must not hide the run's result.
        }
      }

      const elapsed = performance.now() - startedAt;
      addResult(counts, result);
      addResult(bucket, result);
      samples.push({
        door: options.door.name,
        tool: options.spec.name,
        run,
        client_ms: roundMs(elapsed),
        gateway_duration_ms: null,
        trace_id: null,
        status: result.correct ? 200 : 500,
        reason_code: result.reason,
      });

      if (run % 10 === 0 || run === options.runs) {
        options.context.log(
          `[measure] m2-scenarios ${options.spec.name}/${options.door.name}: ${run}/${options.runs} runs`,
        );
      }
    }
  } finally {
    await refuser.close();
  }

  return { spec: options.spec, door: options.door, samples, counts, byRunKind };
}

/**
 * M2: scenario A and scenario C through the three doors, with network errors
 * and the host's 60 second cut. The final task list decides whether a run was
 * correct; duplicate and lost writes are counted separately.
 */
const scenario: Scenario = {
  name: 'm2-scenarios',
  description:
    'M2: kịch bản A một task và C ba mươi task qua ba cửa vào, mỗi cặp kịch bản và cửa lặp theo --runs, có lỗi mạng cố ý và cắt 60 giây của client giả Thổ Thần; đích chọn bằng LAB_MEASURE_TARGET, mặc định gateway.',

  async run(context: MeasureContext): Promise<ScenarioResult> {
    const targetName = resolveTargetName();
    const timeoutRuns = timeoutRunsFromEnv();
    const groups: GroupOutcome[] = [];

    for (const spec of SPECS) {
      for (const door of DOORS) {
        groups.push(
          await measureGroup({
            context,
            targetName,
            spec,
            door,
            runs: context.runs,
            timeoutRuns,
          }),
        );
      }
    }

    const samples = groups.flatMap((group) => group.samples);
    const total = mergeCounts(...groups.map((group) => group.counts));

    const counters: SafetyCounter[] = [
      safetyCounter(
        'duplicate_writes',
        true,
        total.duplicates,
        `Đếm số lần ghi thật trên 1 cho mỗi task, cộng qua ${total.runs} lần chạy; ${total.duplicates} lần ghi thêm.`,
      ),
      safetyCounter(
        'lost_commands',
        true,
        total.lost,
        `Đếm task không có lần ghi nào sau khi đề xuất đã xong, cộng qua ${total.runs} lần chạy; ${total.lost} task sót.`,
      ),
      safetyCounter(
        'unauthorized_writes',
        true,
        total.unauthorized,
        `Đếm lần ghi xảy ra trước khi người yêu cầu bấm Gửi hoặc trước khi trưởng nhóm duyệt; ${total.unauthorized} lần.`,
      ),
      safetyCounter(
        'out_of_scope_fields',
        false,
        null,
        'Phép đo chỉ đọc và ghi task; không gọi find_employee hay get_task nên không có trường cá nhân nào để rò.',
      ),
      safetyCounter(
        'personal_data_in_trace',
        true,
        total.trace_leaks,
        `Đã quét ${total.trace_rows} dòng vết của ${total.trace_runs}/${total.runs} lần chạy cho tên, email, số điện thoại, địa chỉ và khoá; ${total.trace_leaks} dòng chứa.`,
      ),
    ];

    return {
      samples,
      safety: counters,
      parameters: {
        target: targetName,
        target_selection: `${TARGET_ENV}; mặc định ${DEFAULT_TARGET}`,
        runs_per_group: context.runs,
        scenario_task_ids: Object.fromEntries(SPECS.map((spec) => [spec.name, spec.taskIds])),
        changes: CHANGES,
        doors: DOORS.map((door) => door.name),
        groups: groups.map((group) => ({
          scenario: group.spec.name,
          door: group.door.name,
          counts: group.counts,
          by_run_kind: group.byRunKind,
        })),
        fault_plan: {
          network_error_runs: '1-10 and 12-15: call a port that resets the connection, then send again',
          host_timeout_run: `11 on tho-than-host when the timeout run is on: a silent port, so the fake host gives up after ${HOST_TIMEOUT_MS} ms`,
          drop_answer_runs: '16-25: the task list commits the first answer and closes the connection',
          outage_runs: `26-30: the task list stops for ${M2_OUTAGE_MS} ms in the middle of the run`,
          clean_runs: '31 onward: no fault',
        },
        host_timeout_ms: HOST_TIMEOUT_MS,
        timeout_runs_per_group: timeoutRuns,
        outage_ms: M2_OUTAGE_MS,
        wait_timeouts_ms: {
          write: WRITE_WAIT_MS,
          settle: SETTLE_WAIT_MS,
          outage_settle: OUTAGE_WAIT_MS,
        },
        counts: {
          total,
          by_group: Object.fromEntries(
            groups.map((group) => [`${group.spec.name}/${group.door.name}`, group.counts]),
          ),
        },
        expected: {
          assignee: CHANGES.assignee,
          writes_per_task: 1,
          version_step: 1,
        },
      },
      notes: [
        'Mỗi lần chạy dựng một đích mới trên cổng mạng trống và thư mục dữ liệu tạm, nên bảng lệnh ghi và bảng vết chỉ chứa đúng lần chạy đó.',
        'Kịch bản A đổi người phụ trách T-12; kịch bản C đổi người phụ trách 30 task T-5 đến T-34 và chờ anh Quang duyệt.',
        `Ba cửa vào là http, mcp-http và tho-than-host; mỗi cặp kịch bản và cửa lặp ${context.runs} lần.`,
        `Lỗi mạng cố ý ở các lần 1-10 và 12-15: gọi vào một cổng đóng kết nối ngay, rồi gửi lại. Hết giờ ${HOST_TIMEOUT_MS} ms ở lần 11 của cửa tho-than-host: không có phản hồi, client giả bỏ cuộc rồi gửi lại.`,
        `Các lần 16-25 làm rơi phản hồi sau khi danh sách task đã ghi; các lần 26-30 cho danh sách task ngừng ${M2_OUTAGE_MS} ms giữa chừng.`,
        `Mục tiêu ban đầu 99/100 mỗi nhóm: kết quả ${total.correct}/${total.runs} lần đúng kết quả cuối, ${total.duplicates} ghi trùng, ${total.lost} lệnh mất, ${total.point_missed} lần không chạm đúng lỗi cố ý.`,
        `Đã ghi lại ${total.errors} lỗi mạng cố ý và ${total.timeouts} lần hết giờ; tổng số lần gửi lại là ${total.draft_retries + total.write_retries}.`,
      ],
    };
  },
};

export default scenario;
