import { z } from 'zod';
import { DENY_REASONS, REASON_CODES } from './reasons.js';

/**
 * The status names the AgentLize gateway uses for a request
 * (`rd/design/agentlize-gateway-alignment.md`, section 3). The Lab keeps its
 * own internal status and adds this second name at the edge.
 * `cancelled` has no step in the real gateway; the Lab passes its own name
 * through rather than calling a withdrawn draft rejected or expired.
 */
export const GATEWAY_STATUSES = [
  'pending',
  'executing',
  'executed',
  'failed',
  'rejected',
  'expired',
  'cancelled',
] as const;

export type GatewayStatus = (typeof GATEWAY_STATUSES)[number];

/**
 * The shape every tool returns. `reason_code` is always present so a caller can
 * branch on it without parsing the Vietnamese sentence; it is null on success.
 * `deny_reason` is the gateway's own name for a refusal or a withheld field
 * (ADR-0010 section 3.5), so a host can branch on the name it already knows.
 * `gateway_status` names a proposal in the gateway's vocabulary; the other two
 * flags say whether the text carries free text from a system and whether a
 * part of it was cut.
 */
export const toolResponseSchema = z.object({
  text: z.string().min(1),
  reason_code: z.enum(REASON_CODES).nullable(),
  deny_reason: z.enum(DENY_REASONS).nullable(),
  gateway_status: z.enum(GATEWAY_STATUSES).nullable().optional(),
  untrusted_content: z.boolean().optional(),
  truncated: z.boolean().optional(),
  trace_id: z.string().min(1),
});

export type ToolResponse = z.infer<typeof toolResponseSchema>;

/**
 * What calling a tool can lead to. `read` changes no data; `propose` drafts a
 * change that a person still has to confirm on the gateway's page.
 */
export type ToolKind = 'read' | 'propose';

/**
 * One entry of the tool catalog. The description is Vietnamese because it is
 * shown to the agent and to the person reading the transcript. The input
 * schema is a zod schema, the same type the MCP SDK accepts.
 */
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly kind: ToolKind;
  readonly inputSchema: z.ZodType;
}

export type ToolCatalog = readonly ToolDefinition[];
