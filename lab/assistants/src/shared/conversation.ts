import { turnCostUsd } from './cost.js';
import type { ToolDoor } from './door.js';
import type { AssistantJob, ConversationRecord, JobVerdict, ToolCallRecord } from './jobs.js';
import { addUsage, EMPTY_USAGE, type ModelClient, type ModelMessage, type ModelUsage } from './model.js';
import { SYSTEM_PROMPT } from './system-prompt.js';
import type { TurnUsage, UsageReporter } from './usage.js';

/** A conversation may ask for at most this many model turns before the loop gives up. */
export const DEFAULT_MAX_STEPS = 8;

export interface ConversationOptions {
  readonly job: AssistantJob;
  readonly turnId: string;
  readonly model: ModelClient;
  readonly door: ToolDoor;
  readonly usage: UsageReporter;
  readonly maxSteps?: number;
  /** Monotonic clock for latency; tests replace it so the numbers are exact. */
  readonly now?: () => number;
  /** Wall clock for the price window; tests replace it so peak is deterministic. */
  readonly nowDate?: () => Date;
}

export interface ConversationOutcome {
  readonly record: ConversationRecord;
  readonly verdict: JobVerdict;
  readonly usage: ModelUsage;
  readonly turnUsage: TurnUsage;
  readonly usageReported: boolean;
  readonly modelMs: number;
  readonly gatewayMs: number;
  readonly totalMs: number;
  readonly modelCalls: number;
  readonly toolCalls: number;
}

/**
 * One conversation turn: send the sentence, run the tool calls the model asks
 * for, attach the turn code, report the cost, and stop at the final answer or
 * at the step limit (issue #107). A and B differ only in the door they pass in.
 */
export async function runConversation(options: ConversationOptions): Promise<ConversationOutcome> {
  const clock = options.now ?? (() => performance.now());
  const nowDate = options.nowDate ?? (() => new Date());
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const startedAt = clock();
  const tools = await options.door.listTools();
  const messages: ModelMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: options.job.userMessage },
  ];
  const calls: ToolCallRecord[] = [];
  let modelMs = 0;
  let gatewayMs = 0;
  let modelCalls = 0;
  let usage: ModelUsage = EMPTY_USAGE;
  let finalAnswer = '';
  let stopReason: 'answer' | 'max_steps' = 'max_steps';

  for (let step = 0; step < maxSteps; step += 1) {
    const modelStarted = clock();
    const reply = await options.model.complete({ messages, tools });
    modelMs += clock() - modelStarted;
    modelCalls += 1;
    usage = addUsage(usage, reply.usage);

    // The assistant turn belongs in the history even when it only asks for a tool.
    messages.push({ role: 'assistant', content: reply.text ?? '', toolCalls: reply.toolCalls });
    if (reply.toolCalls.length === 0) {
      finalAnswer = reply.text ?? '';
      stopReason = 'answer';
      break;
    }

    for (const call of reply.toolCalls) {
      const result = await options.door.callTool({
        name: call.name,
        args: call.arguments,
        turnId: options.turnId,
      });
      gatewayMs += Math.max(0, result.durationMs);
      calls.push({
        name: call.name,
        args: call.arguments,
        text: result.text,
        reasonCode: result.reasonCode,
        isError: result.isError,
      });
      messages.push({ role: 'tool', toolCallId: call.id, content: result.text });
    }
  }

  const turnUsage: TurnUsage = {
    turnId: options.turnId,
    model: options.model.name,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    costUsd: turnCostUsd(usage, nowDate()),
  };
  // A turn with no tool call has no trace line, so the gateway has nothing to attach the
  // cost to. The run is still graded; it just cannot carry a cost.
  const usageReported = calls.length === 0 ? false : (await options.usage.report(turnUsage)).reported;
  const record: ConversationRecord = { finalAnswer, toolCalls: calls, stopReason };

  return {
    record,
    verdict: options.job.grade(record),
    usage,
    turnUsage,
    usageReported,
    modelMs,
    gatewayMs,
    totalMs: clock() - startedAt,
    modelCalls,
    toolCalls: calls.length,
  };
}
