import { z } from 'zod';
import { REASON_CODES } from './reasons.js';

/**
 * The shape every tool returns. `reason_code` is always present so a caller can
 * branch on it without parsing the Vietnamese sentence; it is null on success.
 */
export const toolResponseSchema = z.object({
  text: z.string().min(1),
  reason_code: z.enum(REASON_CODES).nullable(),
  trace_id: z.string().min(1),
});

export type ToolResponse = z.infer<typeof toolResponseSchema>;

/**
 * One entry of the tool catalog. The description is Vietnamese because it is
 * shown to the agent and to the person reading the transcript. The input
 * schema is a zod schema, the same type the MCP SDK accepts.
 */
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: z.ZodType;
}

export type ToolCatalog = readonly ToolDefinition[];
