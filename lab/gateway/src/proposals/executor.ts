import type { Proposal } from './proposal-store.js';

/** What the executor says when it takes a confirmed proposal. */
export interface ExecutionReceipt {
  readonly state: 'received';
}

/**
 * The seam between the Gửi button and the write. The page calls it once per
 * confirmed proposal; the real executor (issue #12) turns the proposal into a
 * command for the task list, with its idempotency key and version check.
 */
export interface ProposalExecutor {
  execute(proposal: Proposal): Promise<ExecutionReceipt>;
}

/** Stands in until the real executor exists: it takes the proposal and writes nothing. */
export class AcknowledgingExecutor implements ProposalExecutor {
  execute(_proposal: Proposal): Promise<ExecutionReceipt> {
    return Promise.resolve({ state: 'received' });
  }
}
