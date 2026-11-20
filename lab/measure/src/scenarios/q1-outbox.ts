import { performance } from 'node:perf_hooks';
import { safetyCounter } from '../safety.js';
import { roundMs } from '../stats.js';
import {
  DEFAULT_TARGET,
  TARGET_ENV,
  createTarget,
  resolveTargetName,
  type TargetName,
  type WriteTarget,
} from '../targets/index.js';
import { sleep, verifySnapshots, waitForCommand, waitForSettled, waitForWrite } from '../targets/verify.js';
import type { MeasureContext, SafetyCounter, Sample, Scenario, ScenarioResult } from '../types.js';

type CrashPoint = 'before-first' | 'mid-17' | 'after-last';
/** The thirty open tasks of chị Lan; positions 1 to 30 in the proposal. */
const TASK_IDS = Array.from({ length: 30 }, (_, index) => `T-${index + 5}`);
const CHANGES = { assignee: 'NV-04' } as const;
const CRASH_POINTS: readonly CrashPoint[] = ['before-first', 'mid-17', 'after-last'];
const CRASH_POSITION: Readonly<Record<CrashPoint, number>> = {
  'before-first': 1,
  'mid-17': 17,
  'after-last': 30,
};
const DEFAULT_OUTAGE_MS = 20_000;
const MAX_OUTAGE_MS = 120_000;
/** Long enough for the first request to reach the task list before the gateway is stopped. */
const HOLD_BEFORE_FIRST_MS = 5_000;
const HOLD_AFTER_MS = 60_000;
const COMMAND_WAIT_MS = 10_000;
const WRITE_WAIT_MS = 30_000;
const RESTART_WAIT_MS = 60_000;
const OUTAGE_WAIT_MS = 120_000;

interface Counts {
  runs: number;
  correct: number;
  incorrect: number;
  errors: number;
  retries: number;
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
  retries: number;
  unauthorized: number;
  pointMissed: boolean;
  errors: number;
  restarts: number;
  scanned: boolean;
  traceRows: number;
  traceLeaks: number;
}

function emptyCounts(): Counts {
  return {
    runs: 0,
    correct: 0,
    incorrect: 0,
    errors: 0,
    retries: 0,
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
  counts.retries += result.retries;
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
    merged.retries += part.retries;
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

function crashPointFor(run: number): CrashPoint {
  const point = CRASH_POINTS[(run - 1) % CRASH_POINTS.length];
  if (point === undefined) throw new Error('the crash point list is empty');
  return point;
}

function outageFromEnv(): { value: number; shortened: boolean } {
  const raw = process.env['LAB_MEASURE_OUTAGE_MS'];
  if (raw === undefined || raw.trim() === '') return { value: DEFAULT_OUTAGE_MS, shortened: false };
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > MAX_OUTAGE_MS) {
    throw new Error(`LAB_MEASURE_OUTAGE_MS must be a whole number from 0 to ${MAX_OUTAGE_MS}, got "${raw}"`);
  }
  return { value, shortened: value < DEFAULT_OUTAGE_MS };
}

function failureReason(result: Omit<RunResult, 'reason'>): string {
  if (result.pointMissed) return 'POINT_MISSED';
  if (result.duplicates > 0) return 'DUPLICATE_WRITE';
  if (result.lost > 0) return 'LOST_COMMAND';
  if (result.wrong > 0) return 'WRONG_CONTENT';
  if (result.unauthorized > 0) return 'UNAUTHORIZED_WRITE';
  if (!result.correct) return 'INCOMPLETE';
  return 'OK';
}

function traceCounts(target: WriteTarget): Pick<RunResult, 'scanned' | 'traceRows' | 'traceLeaks'> {
  const scan = target.scanTrace();
  return { scanned: true, traceRows: scan.rows, traceLeaks: scan.hits };
}

/** Step 1: stop the gateway before the first item, mid item 17 or after item 30, then restart it. */
async function runStep1(target: WriteTarget, point: CrashPoint): Promise<RunResult> {
  const position = CRASH_POSITION[point];
  const fault =
    point === 'before-first'
      ? ({ kind: 'hold-before-commit', position: 1, delayMs: HOLD_BEFORE_FIRST_MS } as const)
      : ({ kind: 'hold-after-commit', position, delayMs: HOLD_AFTER_MS } as const);

  const proposal = await target.sendProposal({ taskIds: TASK_IDS, changes: CHANGES, fault });

  let pointMissed = false;
  if (point === 'before-first') {
    // The command is marked sent before the PATCH; the short hold then keeps it out of the task list.
    await waitForCommand(target, 1, (command) => command.status === 'sent_unknown', COMMAND_WAIT_MS);
    await sleep(500);
    const before = await target.history(TASK_IDS);
    pointMissed = before.some((item) => item.writes !== 0);
  } else {
    const watched = TASK_IDS[position - 1];
    if (watched === undefined) throw new Error(`no task at position ${position}`);
    await waitForWrite(target, watched, 1, WRITE_WAIT_MS);
  }

  await target.crash();
  await target.restart();
  await waitForSettled(target, proposal.proposalId, RESTART_WAIT_MS);

  const final = await target.history(TASK_IDS);
  const check = verifySnapshots(proposal.baseline, final, CHANGES);
  const observation = target.observe();
  const retries = observation.trace.filter((row) => row.ruleId === 'WRITE.RETRY').length;
  const trace = traceCounts(target);
  // A command that never needed a resend means the crash missed the in-flight item.
  if (point !== 'before-first' && retries === 0) pointMissed = true;
  const correct =
    !pointMissed &&
    check.duplicates === 0 &&
    check.lost === 0 &&
    check.wrong === 0 &&
    proposal.writesBeforeApproval === 0 &&
    observation.writeCommands === TASK_IDS.length &&
    target.restarts === 1;

  const result = {
    correct,
    duplicates: check.duplicates,
    lost: check.lost,
    wrong: check.wrong,
    retries,
    unauthorized: proposal.writesBeforeApproval,
    pointMissed,
    errors: 0,
    restarts: target.restarts,
    ...trace,
  };
  return { ...result, reason: failureReason(result) };
}

/** Step 2: the task list disappears for a while; the gateway must finish without a restart. */
async function runStep2(target: WriteTarget, outageMs: number): Promise<RunResult> {
  // Item 15 commits, then its answer is held: the run is exactly in the middle when the task list goes away.
  const proposal = await target.sendProposal({
    taskIds: TASK_IDS,
    changes: CHANGES,
    fault: { kind: 'hold-after-commit', position: 15, delayMs: HOLD_AFTER_MS },
  });
  const middle = TASK_IDS[14];
  if (middle === undefined) throw new Error('no task at position 15');
  await waitForWrite(target, middle, 1, WRITE_WAIT_MS);

  await target.outageTasks(outageMs);
  await waitForSettled(target, proposal.proposalId, OUTAGE_WAIT_MS);

  const final = await target.history(TASK_IDS);
  const check = verifySnapshots(proposal.baseline, final, CHANGES);
  const observation = target.observe();
  const retries = observation.trace.filter((row) => row.ruleId === 'WRITE.RETRY').length;
  const trace = traceCounts(target);
  // The task list going away must force a resend; none means the outage missed the run.
  const pointMissed = retries === 0;
  const correct =
    !pointMissed &&
    check.duplicates === 0 &&
    check.lost === 0 &&
    check.wrong === 0 &&
    proposal.writesBeforeApproval === 0 &&
    observation.writeCommands === TASK_IDS.length &&
    target.restarts === 0;

  const result = {
    correct,
    duplicates: check.duplicates,
    lost: check.lost,
    wrong: check.wrong,
    retries,
    unauthorized: proposal.writesBeforeApproval,
    pointMissed,
    errors: 0,
    restarts: target.restarts,
    ...trace,
  };
  return { ...result, reason: failureReason(result) };
}

/** Step 3: the first write lands, its answer is dropped; the resend must read the old result. */
async function runStep3(target: WriteTarget): Promise<RunResult> {
  const proposal = await target.sendProposal({
    taskIds: TASK_IDS,
    changes: CHANGES,
    fault: { kind: 'drop-answer-after-commit', count: 1 },
  });
  await waitForSettled(target, proposal.proposalId, RESTART_WAIT_MS);

  const final = await target.history(TASK_IDS);
  const check = verifySnapshots(proposal.baseline, final, CHANGES);
  const observation = target.observe();
  const retries = observation.trace.filter((row) => row.ruleId === 'WRITE.RETRY').length;
  const trace = traceCounts(target);
  // No resend means the dropped answer never happened, so the step did not exercise its fault.
  const pointMissed = retries === 0;
  const correct =
    !pointMissed &&
    check.duplicates === 0 &&
    check.lost === 0 &&
    check.wrong === 0 &&
    proposal.writesBeforeApproval === 0 &&
    observation.writeCommands === TASK_IDS.length;

  const result = {
    correct,
    duplicates: check.duplicates,
    lost: check.lost,
    wrong: check.wrong,
    retries,
    unauthorized: proposal.writesBeforeApproval,
    pointMissed,
    errors: 0,
    restarts: target.restarts,
    ...trace,
  };
  return { ...result, reason: failureReason(result) };
}

interface StepOutcome {
  readonly samples: Sample[];
  readonly counts: Counts;
  readonly byLabel: Readonly<Record<string, Counts>>;
}

async function measureStep(options: {
  readonly context: MeasureContext;
  readonly step: string;
  readonly targetName: TargetName;
  readonly runs: number;
  readonly label: (run: number) => string;
  readonly runOne: (target: WriteTarget, run: number) => Promise<RunResult>;
}): Promise<StepOutcome> {
  const samples: Sample[] = [];
  const counts = emptyCounts();
  const byLabel: Record<string, Counts> = {};

  for (let run = 1; run <= options.runs; run += 1) {
    const label = options.label(run);
    const bucket = byLabel[label] ?? emptyCounts();
    byLabel[label] = bucket;

    const startedAt = performance.now();
    const target = createTarget(options.targetName);
    let result: RunResult;
    try {
      await target.build();
      result = await options.runOne(target, run);
    } catch (error) {
      result = {
        correct: false,
        reason: 'ERROR',
        duplicates: 0,
        lost: 0,
        wrong: 0,
        retries: 0,
        unauthorized: 0,
        pointMissed: false,
        errors: 1,
        restarts: target.restarts,
        scanned: false,
        traceRows: 0,
        traceLeaks: 0,
      };
      options.context.log(
        `[measure] ${options.step} run ${run}: ${error instanceof Error ? error.message : String(error)}`,
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
      door: options.step,
      tool: label,
      run,
      client_ms: roundMs(elapsed),
      gateway_duration_ms: null,
      trace_id: null,
      status: result.correct ? 200 : 500,
      reason_code: result.reason,
    });

    if (run % 10 === 0 || run === options.runs) {
      options.context.log(`[measure] ${options.step}: ${run}/${options.runs} runs`);
    }
  }

  return { samples, counts, byLabel };
}

/**
 * Q1: the crash steps of the thirty-task write, a hundred times each.
 * Step 1 stops the gateway at three points, step 2 takes the task list away
 * without restarting the gateway, and step 3 drops a committed answer.
 */
const scenario: Scenario = {
  name: 'q1-outbox',
  description:
    'Q1: ba bước sập giữa chừng của lệnh 30 task, mỗi bước lặp theo --runs, đếm task sót, task ghi hai lần và nội dung cuối; đích chọn bằng LAB_MEASURE_TARGET, mặc định gateway.',

  async run(context: MeasureContext): Promise<ScenarioResult> {
    const targetName = resolveTargetName();
    const outage = outageFromEnv();

    const step1 = await measureStep({
      context,
      step: 'q1-step1-crash',
      targetName,
      runs: context.runs,
      label: (run) => `${targetName}:${crashPointFor(run)}`,
      runOne: (target, run) => runStep1(target, crashPointFor(run)),
    });

    const step2 = await measureStep({
      context,
      step: 'q1-step2-outage',
      targetName,
      runs: context.runs,
      label: () => targetName,
      runOne: (target) => runStep2(target, outage.value),
    });

    const step3 = await measureStep({
      context,
      step: 'q1-step3-lost-answer',
      targetName,
      runs: context.runs,
      label: () => targetName,
      runOne: (target) => runStep3(target),
    });

    const samples = [...step1.samples, ...step2.samples, ...step3.samples];
    const total = mergeCounts(step1.counts, step2.counts, step3.counts);

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
        runs_per_step: context.runs,
        task_ids: TASK_IDS,
        changes: CHANGES,
        crash_points: step1.byLabel,
        outage_ms: outage.value,
        outage_shortened: outage.shortened,
        fault_delays_ms: {
          before_first: HOLD_BEFORE_FIRST_MS,
          after_item: HOLD_AFTER_MS,
        },
        wait_timeouts_ms: {
          command: COMMAND_WAIT_MS,
          write: WRITE_WAIT_MS,
          restart: RESTART_WAIT_MS,
          outage: OUTAGE_WAIT_MS,
        },
        counts: {
          step1: step1.counts,
          step2: step2.counts,
          step3: step3.counts,
          total,
        },
        expected: {
          assignee: CHANGES.assignee,
          writes_per_task: 1,
          version_step: 1,
        },
      },
      notes: [
        'Mỗi lần chạy dựng một đích mới trên cổng mạng trống và thư mục dữ liệu tạm, nên bảng lệnh ghi và bảng vết chỉ chứa đúng lần chạy đó.',
        `Bước 1 chia ${context.runs} lần cho ba thời điểm tắt: trước task đầu, giữa task 17 và sau task 30.`,
        `Bước 2 cho danh sách task ngừng ${outage.value} ms giữa chừng và không khởi động lại cổng; số lần khởi động lại của cổng phải bằng 0.`,
        'Bước 3 làm rơi phản hồi của lần ghi đầu sau khi đã ghi; lần gửi lại phải dùng đúng mã cũ và nhận kết quả cũ.',
        `Mục tiêu ban đầu 99/100 mỗi bước: kết quả ${total.correct}/${total.runs} lần đúng kết quả cuối, ${total.duplicates} ghi trùng, ${total.lost} lệnh mất.`,
        `Bước 1 có ${step1.counts.point_missed} lần không chạm đúng thời điểm tắt; bước 3 có ${step3.counts.point_missed} lần không thấy lần gửi lại.`,
      ],
    };
  },
};

export default scenario;
