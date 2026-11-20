import { setTimeout as sleep } from 'node:timers/promises';
import type { ProposalStatus, TargetCommand, TaskSnapshot, WriteTarget } from './types.js';

const POLL_MS = 100;

/** What comparing the final task list with the card says. */
export interface Verification {
  /** Committed writes above the first one, summed over every task. */
  readonly duplicates: number;
  /** Tasks the run never wrote. */
  readonly lost: number;
  /** Tasks whose stored content is not the card's change on top of the value read at draft time. */
  readonly wrong: number;
}

/** Wait until a task shows at least `atLeast` committed writes. */
export async function waitForWrite(
  target: WriteTarget,
  taskId: string,
  atLeast: number,
  timeoutMs = 30_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const [snapshot] = await target.history([taskId]);
      if ((snapshot?.writes ?? 0) >= atLeast) return;
    } catch {
      // The task list can be between two processes during an outage; keep waiting.
    }
    await sleep(POLL_MS);
  }
  throw new Error(`timed out waiting for ${taskId} to reach ${atLeast} committed writes`);
}

/** Wait until a write command at `position` satisfies `read`. */
export async function waitForCommand(
  target: WriteTarget,
  position: number,
  read: (command: TargetCommand) => boolean,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const command = target.observe().commands.find((candidate) => candidate.position === position);
      if (command !== undefined && read(command)) return;
    } catch {
      // The database can be locked for a moment by the gateway's own write; keep waiting.
    }
    await sleep(POLL_MS);
  }
  throw new Error(`timed out waiting for write command ${position}`);
}

function isSettled(status: ProposalStatus): boolean {
  const text = status.text;
  if (text.startsWith('CHƯA THỰC HIỆN')) return true;
  if (text.includes('chưa nhận được kết quả') || text.includes('đang gửi lại')) return false;
  if (text.includes('đang chờ') || text.includes('cổng chưa gửi lệnh ghi')) return false;
  if (text.includes('đã ghi')) return true;
  if (
    text.includes('bị bỏ qua') ||
    text.includes('trưởng nhóm đã từ chối') ||
    text.includes('đã hết hạn') ||
    text.includes('đã bấm Sửa')
  ) {
    return true;
  }
  return status.reasonCode !== null;
}

/**
 * Poll one proposal until it has a final answer. A resend in progress is not
 * final; a refusal, a partial write or a full write is.
 */
export async function waitForSettled(
  target: WriteTarget,
  proposalId: string,
  timeoutMs = 60_000,
): Promise<ProposalStatus> {
  const deadline = Date.now() + timeoutMs;
  let last: ProposalStatus | undefined;
  while (Date.now() < deadline) {
    last = await target.status(proposalId);
    if (isSettled(last)) return last;
    await sleep(POLL_MS);
  }
  throw new Error(`timed out waiting for ${proposalId} to settle`);
}

/**
 * Compare the task list after the run with the list read before the first
 * write. Every task must hold exactly one write, one more version, the card's
 * change, and the same value in every other field.
 */
export function verifySnapshots(
  baseline: readonly TaskSnapshot[],
  final: readonly TaskSnapshot[],
  changes: Readonly<Record<string, string>>,
): Verification {
  const byId = new Map(final.map((item) => [item.taskId, item]));
  let duplicates = 0;
  let lost = 0;
  let wrong = 0;

  for (const before of baseline) {
    const after = byId.get(before.taskId);
    if (after === undefined || after.writes === 0) {
      lost += 1;
      continue;
    }
    if (after.writes > 1) duplicates += after.writes - 1;
    if (after.version !== before.version + 1) {
      wrong += 1;
      continue;
    }

    const keys = new Set([...Object.keys(before.content), ...Object.keys(after.content)]);
    for (const key of keys) {
      if (key === 'version') continue;
      const expected = Object.hasOwn(changes, key) ? changes[key] : before.content[key];
      if (after.content[key] !== expected) {
        wrong += 1;
        break;
      }
    }
  }

  return { duplicates, lost, wrong };
}

export { sleep };
