import { createServer, type Server, type Socket } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { LOOPBACK_HOST } from '@lab/shared';
import type { ToolCallInput, ToolCallResult, ToolDoor } from './door.js';
import type { ConversationRecord } from './jobs.js';
import type { AssistantFaults, SampleFaults } from './result.js';

/**
 * The M2 fault layer of the model runs (issue #140). It repeats the two faults
 * `m2-scenarios.ts` sends at a tool call: a connection that resets before the
 * call reaches the gateway, and a call that never answers before a short cut.
 * The write-target faults (`drop-answer-after-commit`, `hold-after-commit`)
 * stay in the automated layer: an assistant only drafts a proposal and never
 * presses Gửi, so there is no committed write to lose an answer from.
 */

export const FAULT_PLANS = ['m2'] as const;
export type FaultPlanName = (typeof FAULT_PLANS)[number];

/** The cut of the timeout fault. Short on purpose: the silent port never commits anything. */
export const FAULT_TIMEOUT_MS = 2_000;

export type FaultMode = 'none' | 'network' | 'timeout';

/**
 * The same shape as the m2-scenarios plan for the first twenty runs: ten
 * network errors, one timeout, three more network errors, then clean runs.
 * The fault is aimed at `propose_task_change`, the call that would become a
 * write after a person presses Gửi.
 */
export function faultModeForRun(run: number): FaultMode {
  if (run >= 1 && run <= 10) return 'network';
  if (run === 11) return 'timeout';
  if (run >= 12 && run <= 15) return 'network';
  return 'none';
}

export interface FaultServers {
  readonly refuserUrl: string;
  readonly blackHoleUrl: string;
  close(): Promise<void>;
}

interface ListeningServer {
  readonly url: string;
  close(): Promise<void>;
}

async function listen(onSocket: (socket: Socket) => void): Promise<ListeningServer> {
  const sockets = new Set<Socket>();
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => sockets.delete(socket));
    onSocket(socket);
  });

  await new Promise<void>((ready, fail) => {
    server.once('error', fail);
    server.listen(0, LOOPBACK_HOST, () => {
      server.off('error', fail);
      ready();
    });
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('the fault server has no port');

  let closed = false;
  return {
    url: `http://${LOOPBACK_HOST}:${address.port}`,
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((done) => server.close(() => done()));
    },
  };
}

/** A port that takes the request and resets the connection, so the client sees a network error. */
async function startRefuser(): Promise<ListeningServer> {
  return listen((socket) => {
    socket.once('data', () => socket.destroy());
  });
}

/** A port that accepts the connection and never answers, so the client can only time out. */
async function startBlackHole(): Promise<ListeningServer> {
  return listen(() => {
    // Keep the socket open and silent.
  });
}

export async function startFaultServers(): Promise<FaultServers> {
  const refuser = await startRefuser();
  const blackHole = await startBlackHole();
  return {
    refuserUrl: refuser.url,
    blackHoleUrl: blackHole.url,
    async close(): Promise<void> {
      await Promise.all([refuser.close(), blackHole.close()]);
    },
  };
}

export interface FaultCounters {
  readonly mode: FaultMode;
  faultUsed: boolean;
  networkErrors: number;
  timeouts: number;
  retries: number;
}

export interface FaultDoorOptions {
  readonly door: ToolDoor;
  readonly mode: Exclude<FaultMode, 'none'>;
  readonly faultUrl: string;
  /** Build a door of the same kind against the fault port, with the same key and person. */
  readonly createFaultDoor: (url: string) => Promise<ToolDoor>;
  readonly timeoutMs?: number;
}

export interface FaultedDoor {
  readonly door: ToolDoor;
  readonly counters: FaultCounters;
}

/**
 * Wrap one conversation's door. Before the first `propose_task_change` call it
 * makes one call against the fault port, counts the failure as an error and a
 * re-send, then calls the real door. A retrying client would do exactly this;
 * the model sees one successful answer and never a half-written result.
 */
export function createFaultDoor(options: FaultDoorOptions): FaultedDoor {
  const timeoutMs = options.timeoutMs ?? FAULT_TIMEOUT_MS;
  const counters: FaultCounters = {
    mode: options.mode,
    faultUsed: false,
    networkErrors: 0,
    timeouts: 0,
    retries: 0,
  };
  let armed = true;

  const door: ToolDoor = {
    name: options.door.name,
    listTools: () => options.door.listTools(),
    async callTool(input: ToolCallInput): Promise<ToolCallResult> {
      if (!armed || input.name !== 'propose_task_change') return options.door.callTool(input);
      armed = false;
      counters.faultUsed = true;
      const faultDoor = await options.createFaultDoor(options.faultUrl);

      if (options.mode === 'network') {
        try {
          await faultDoor.callTool(input);
        } catch {
          counters.networkErrors += 1;
          counters.retries += 1;
          return options.door.callTool(input);
        }
        throw new Error('the refusing fault port answered; the network fault was not injected');
      }

      // The silent port never answers. Abandon the attempt at the cut, then re-send.
      const attempt = faultDoor.callTool(input).catch(() => 'failed' as const);
      const first = await Promise.race([attempt, sleep(timeoutMs).then(() => 'timeout' as const)]);
      if (first !== 'timeout') {
        throw new Error('the silent fault port answered before the cut; the timeout fault was not injected');
      }
      counters.timeouts += 1;
      counters.retries += 1;
      return options.door.callTool(input);
    },
  };

  return { door, counters };
}

export interface ProposalTally {
  readonly proposals: number;
  /** Extra proposals for a task already covered in this run. */
  readonly duplicateTasks: number;
  /** Expected tasks that no successful proposal covered; 0 when the model drafted none. */
  readonly incompleteTasks: number;
}

function successfulProposal(call: ConversationRecord['toolCalls'][number]): boolean {
  return call.name === 'propose_task_change' && !call.isError && call.text.includes('Link xác nhận');
}

function taskIdsOf(call: ConversationRecord['toolCalls'][number]): string[] {
  const value = call.args['task_ids'];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

/**
 * Count the proposals of one conversation. A duplicate is a task covered by a
 * second successful proposal; an incomplete task is one the job named but no
 * proposal covered. Both sit at the proposal layer: a duplicate or lost write
 * cannot happen here because nobody presses Gửi.
 */
export function countProposals(
  record: ConversationRecord,
  expectedTaskIds: readonly string[],
): ProposalTally {
  const covered = new Map<string, number>();
  let proposals = 0;
  for (const call of record.toolCalls) {
    if (!successfulProposal(call)) continue;
    proposals += 1;
    for (const taskId of taskIdsOf(call)) covered.set(taskId, (covered.get(taskId) ?? 0) + 1);
  }

  let duplicateTasks = 0;
  for (const count of covered.values()) duplicateTasks += Math.max(0, count - 1);

  const incompleteTasks =
    proposals === 0 ? 0 : expectedTaskIds.filter((taskId) => !covered.has(taskId)).length;

  return { proposals, duplicateTasks, incompleteTasks };
}

/** Turn one run's counters into the small block the sample keeps. */
export function sampleFaultsOf(
  mode: FaultMode,
  counters: FaultCounters | null,
  tally: ProposalTally,
): SampleFaults {
  return {
    mode,
    attempted: counters?.faultUsed ?? false,
    network_errors: counters?.networkErrors ?? 0,
    timeouts: counters?.timeouts ?? 0,
    retries: counters?.retries ?? 0,
    proposals: tally.proposals,
    duplicate_proposals: tally.duplicateTasks,
    incomplete_proposals: tally.incompleteTasks,
  };
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/**
 * The result-level M2 block. `duplicate_writes` and `lost_commands` are 0
 * because the layer never creates a write command; the note says so beside the
 * proposal counters that this layer can actually move.
 */
export function buildFaultSummary(
  samples: readonly SampleFaults[],
  plan: FaultPlanName,
  timeoutMs = FAULT_TIMEOUT_MS,
): AssistantFaults {
  const network = samples.filter((sample) => sample.mode === 'network');
  const timeout = samples.filter((sample) => sample.mode === 'timeout');
  return {
    plan,
    timeout_ms: timeoutMs,
    network_runs: network.length,
    timeout_runs: timeout.length,
    clean_runs: samples.filter((sample) => sample.mode === 'none').length,
    point_missed: samples.filter((sample) => sample.mode !== 'none' && !sample.attempted).length,
    network_errors: sum(samples.map((sample) => sample.network_errors)),
    timeouts: sum(samples.map((sample) => sample.timeouts)),
    retries: sum(samples.map((sample) => sample.retries)),
    duplicate_proposals: sum(samples.map((sample) => sample.duplicate_proposals)),
    incomplete_proposals: sum(samples.map((sample) => sample.incomplete_proposals)),
    duplicate_writes: 0,
    lost_commands: 0,
    note:
      'Lớp có mô hình chỉ soạn đề xuất và không bấm Gửi, nên không tạo lệnh ghi nào: '
      + 'ghi trùng và lệnh mất bằng 0 theo thiết kế. Đề xuất trùng và đề xuất thiếu là hai bộ đếm thay thế ở lớp này.',
  };
}
