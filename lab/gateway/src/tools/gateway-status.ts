import type { GatewayStatus } from '@lab/shared';
import type { ProposalStatus } from '../proposals/index.js';
import type { CommandStatus } from '../writes/index.js';

/**
 * The one mapping from the Lab's internal statuses to the gateway's names
 * (`rd/design/agentlize-gateway-alignment.md`, section 3). A new internal
 * status makes the record below incomplete, so the compiler asks for its name;
 * `gateway-status-test.ts` also walks every list, so a new value cannot ship
 * unmapped.
 *
 * A confirmed proposal is `executing` while any command is still queued or in
 * flight, `executed` when every item landed, and `failed` when at least one
 * item failed and none is still open.
 */
export const GATEWAY_STATUS_BY_PROPOSAL_STATUS: Readonly<Record<ProposalStatus, GatewayStatus>> = {
  awaiting_confirmation: 'pending',
  awaiting_approval: 'pending',
  confirmed: 'executing',
  cancelled: 'cancelled',
  rejected: 'rejected',
  expired: 'expired',
};

/** What one write command says about the whole proposal. */
export const GATEWAY_STATUS_BY_COMMAND_STATUS: Readonly<
  Record<CommandStatus, 'executing' | 'executed' | 'failed'>
> = {
  not_sent: 'executing',
  sent_unknown: 'executing',
  done: 'executed',
  failed: 'failed',
};

/** The gateway name for one proposal, with the commands of a confirmed proposal taken into account. */
export function gatewayStatusOf(
  status: ProposalStatus,
  commandStatuses: readonly CommandStatus[],
): GatewayStatus {
  const base = GATEWAY_STATUS_BY_PROPOSAL_STATUS[status];
  if (status !== 'confirmed' || commandStatuses.length === 0) return base;
  const states = commandStatuses.map((command) => GATEWAY_STATUS_BY_COMMAND_STATUS[command]);
  if (states.includes('executing')) return 'executing';
  return states.includes('failed') ? 'failed' : 'executed';
}
