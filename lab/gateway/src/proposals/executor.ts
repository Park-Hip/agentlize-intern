import type { ReasonCode } from '@lab/shared';
import type { Proposal } from './proposal-store.js';

/** What the executor says when it has dealt with a confirmed proposal. */
export interface ExecutionReceipt {
  /** `done` and `failed` are final; `sent_unknown` means the task list never answered and the gateway will resend. */
  readonly state: 'received' | 'sent_unknown' | 'done' | 'failed';
  readonly commandId?: string;
  readonly attempts?: number;
  readonly reasonCode?: ReasonCode | null;
}

/**
 * The seam between the Gửi button and the write. The page calls it once per
 * confirmed proposal; the executor turns the proposal into one command for the
 * task list, with its fixed idempotency key and its expected version.
 */
export interface ProposalExecutor {
  execute(proposal: Proposal): Promise<ExecutionReceipt>;
  /** Called once when the gateway starts: settle every command a previous run left open. */
  resume?(): Promise<void>;
}
