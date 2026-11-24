import { z } from 'zod';
import { DENY_REASONS, REASON_CODES } from './reasons.js';

/**
 * The shape every tool returns. `reason_code` is always present so a caller can
 * branch on it without parsing the Vietnamese sentence; it is null on success.
 * `deny_reason` is the gateway's own name for a refusal or a withheld field
 * (ADR-0010 section 3.5), so a host can branch on the name it already knows.
 */
export const toolResponseSchema = z.object({
  text: z.string().min(1),
  reason_code: z.enum(REASON_CODES).nullable(),
  deny_reason: z.enum(DENY_REASONS).nullable(),
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
