import type { ToolSpec } from './door.js';

/** Tokens the provider reports for one model call. */
export interface ModelUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** Input tokens served from the provider's prefix cache. */
  readonly cacheHitTokens: number;
  /** Input tokens that were not in the cache. */
  readonly cacheMissTokens: number;
}

export const EMPTY_USAGE: ModelUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheHitTokens: 0,
  cacheMissTokens: 0,
};

export function addUsage(left: ModelUsage, right: ModelUsage): ModelUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cacheHitTokens: left.cacheHitTokens + right.cacheHitTokens,
    cacheMissTokens: left.cacheMissTokens + right.cacheMissTokens,
  };
}

/** One tool call the model asked for. */
export interface ModelToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: Readonly<Record<string, unknown>>;
}

/**
 * One message of the conversation. The loop keeps the whole history and sends
 * it back on every call, so the model can see the tool results it asked for.
 */
export type ModelMessage =
  | { readonly role: 'system' | 'user'; readonly content: string }
  | { readonly role: 'assistant'; readonly content: string; readonly toolCalls: readonly ModelToolCall[] }
  | { readonly role: 'tool'; readonly toolCallId: string; readonly content: string };

export interface ModelReply {
  /** The final sentence, or null when the model only asked for tools. */
  readonly text: string | null;
  readonly toolCalls: readonly ModelToolCall[];
  readonly usage: ModelUsage;
}

export interface ModelRequest {
  readonly messages: readonly ModelMessage[];
  readonly tools: readonly ToolSpec[];
}

/** The seam a real provider and the scripted fake model both implement. */
export interface ModelClient {
  /** The model name reported in the cost line, for example `deepseek-flash`. */
  readonly name: string;
  complete(request: ModelRequest): Promise<ModelReply>;
}
