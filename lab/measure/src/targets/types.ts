import type { TraceRow } from '@lab/gateway';

/** One task as the fake task list holds it, with the number of committed writes. */
export interface TaskSnapshot {
  readonly taskId: string;
  /** Writes that really committed; a replay of the same idempotency key does not count. */
  readonly writes: number;
  readonly version: number;
  /** The task body. It holds fake data only, and a result file must never keep it. */
  readonly content: Readonly<Record<string, unknown>>;
}

/** The proposal a draft created, in the terms the next steps need. */
export interface ProposalDraft {
  readonly proposalId: string;
  readonly needsApproval: boolean;
}

/** What a custom draft gets from the target. The key stays in memory and never reaches a result file. */
export interface DraftContext {
  readonly gateway: string;
  readonly key: string;
}

/**
 * A way to draft the proposal. The default posts to the gateway's HTTP door.
 * A scenario passes its own function when it wants the draft to go through
 * another door, or through a fault, without teaching the target about doors.
 */
export type DraftFunction = (
  context: DraftContext,
  taskIds: readonly string[],
  changes: Readonly<Record<string, string>>,
) => Promise<ProposalDraft>;

/** A hold on one chosen item, keyed by the position in the proposal. */
export type TargetFault =
  | { readonly kind: 'drop-answer-after-commit'; readonly count: number }
  | { readonly kind: 'hold-before-commit'; readonly position: number; readonly delayMs: number }
  | { readonly kind: 'hold-after-commit'; readonly position: number; readonly delayMs: number };

export interface SendProposalInput {
  readonly taskIds: readonly string[];
  readonly changes: Readonly<Record<string, string>>;
  /** Defaults to the gateway's HTTP door. */
  readonly draft?: DraftFunction;
  /** Armed before the Gửi press, because that press is what starts the write. */
  readonly fault?: TargetFault;
}

export interface ProposalRun {
  readonly proposalId: string;
  readonly items: number;
  readonly needsApproval: boolean;
  /** The task list before the first write, so the final content can be compared with the card. */
  readonly baseline: readonly TaskSnapshot[];
  /** Committed writes seen after Gửi and before the lead approved; zero is the safe answer. */
  readonly writesBeforeApproval: number;
}

/** One write command as the target's own store holds it. */
export interface TargetCommand {
  readonly position: number;
  readonly status: string;
  readonly attempts: number;
}

/** What the target's trace and command table held at the moment of the read. */
export interface TargetObservation {
  readonly trace: readonly TraceRow[];
  readonly writeCommands: number;
  readonly commands: readonly TargetCommand[];
}

export interface ProposalStatus {
  readonly status: number;
  readonly text: string;
  readonly reasonCode: string | null;
}

/**
 * One write path a measurement can run against. A scenario only uses these
 * methods, so a second implementation (for example a Temporal target) can
 * replace the gateway one without editing the scenario.
 */
export interface WriteTarget {
  readonly name: string;
  /** How many times this target was started again after a crash; zero for a run that never crashed. */
  readonly restarts: number;
  /** Build the target on free ports and a temporary data folder, ready for one proposal. */
  build(): Promise<void>;
  /** Draft a proposal, send it, and approve it as the lead when the rule file asks for that. */
  sendProposal(input: SendProposalInput): Promise<ProposalRun>;
  /** Stop the target sideways: no signal handler, no closing the database. */
  crash(): Promise<void>;
  /** Start the target again on the same data folder, the way a person starts it after a crash. */
  restart(): Promise<void>;
  /** Take the task list down for `ms`, then bring it back; the target itself keeps running. */
  outageTasks(ms: number): Promise<void>;
  /** Read the committed write count and the stored body of each task. */
  history(taskIds: readonly string[]): Promise<readonly TaskSnapshot[]>;
  /** Read one proposal's status through the requester's tool key. */
  status(proposalId: string): Promise<ProposalStatus>;
  /** Read the trace and the write commands without changing either. */
  observe(): TargetObservation;
  /** Count trace rows that carry a name, a contact value or a key the trace must never hold. */
  scanTrace(): { readonly rows: number; readonly hits: number };
  /** Stop every process and delete the temporary folders. Idempotent. */
  close(): Promise<void>;
}
