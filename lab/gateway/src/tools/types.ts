import type { ReasonCode, ToolDefinition } from '@lab/shared';
import type { FieldsDecision, PolicyEngine } from '../policy/index.js';
import type { ProposalStore } from '../proposals/index.js';
import type { Systems } from '../systems.js';
import type { TraceOutcome } from '../trace/index.js';
import type { Identity } from '../identity/index.js';

/** The asker as the gateway knows them for this one call: the key's person, with role and department read fresh. */
export interface Actor {
  readonly identity: Identity;
  readonly employeeId: string;
  readonly role: string;
  readonly department: string;
}

export interface ToolContext {
  readonly actor: Actor;
  readonly systems: Systems;
  readonly policy: PolicyEngine;
  readonly proposals: ProposalStore;
  /** Address of the gateway as people open it, without a trailing slash. Read at the moment of the call. */
  readonly publicBaseUrl: string;
  readonly now: () => Date;
  /** What the rule file lets this role see of an employee. Already checked: the engine could read the file and knows the role. */
  readonly rules: FieldsDecision;
}

/** Everything a tool says about one call. The HTTP layer turns it into the response and the trace line. */
export interface ToolResult {
  readonly status: number;
  readonly text: string;
  readonly reasonCode: ReasonCode | null;
  readonly outcome: TraceOutcome;
  readonly objectId?: string | null;
  /** The reason the trace keeps when it differs from the one the caller sees. */
  readonly traceReasonCode?: ReasonCode | null;
  readonly outOfScope?: boolean;
  /** The proposal this call drafted or asked about, so the trace line can be followed from draft to send. */
  readonly proposalId?: string | null;
  readonly ruleId?: string | null;
  readonly policyVersion?: number | null;
}

/** A catalog entry plus the code that answers it. The catalog the callers see is `ToolDefinition`. */
export interface RegisteredTool extends ToolDefinition {
  /** Validates `args` against `inputSchema` again, so the handler never sees an unchecked value. */
  run(context: ToolContext, args: unknown): Promise<ToolResult>;
}
