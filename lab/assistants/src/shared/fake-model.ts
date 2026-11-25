import type { ToolCallInput, ToolDoor, ToolSpec } from './door.js';
import type { ModelClient, ModelReply, ModelUsage } from './model.js';

export interface FakeToolCall {
  readonly name: string;
  readonly arguments: Readonly<Record<string, unknown>>;
}

/** One scripted reply. A step with tool calls asks the loop to run them. */
export interface FakeStep {
  readonly text?: string;
  readonly toolCalls?: readonly FakeToolCall[];
  readonly usage?: ModelUsage;
}

export interface FakeModelOptions {
  readonly name?: string;
  readonly steps: readonly FakeStep[];
  /** Tokens a step reports when it does not override them. */
  readonly usage?: ModelUsage;
}

const DEFAULT_USAGE: ModelUsage = {
  inputTokens: 120,
  outputTokens: 18,
  cacheHitTokens: 96,
  cacheMissTokens: 24,
};

/**
 * A model that reads a script instead of calling a provider, so `npm test`
 * runs the whole conversation loop with no key and no network (issue #107).
 * Running past the last step fails loudly: a script that is too short is a
 * broken test, not an answer.
 */
export function createFakeModel(options: FakeModelOptions): ModelClient {
  const steps = [...options.steps];
  let next = 0;

  return {
    name: options.name ?? 'fake-model',
    async complete(): Promise<ModelReply> {
      const step = steps[next];
      if (step === undefined) throw new Error('the fake model ran out of scripted steps');
      next += 1;
      const turn = next;
      return {
        text: step.text ?? null,
        toolCalls: (step.toolCalls ?? []).map((call, index) => ({
          id: `call-${turn}-${index + 1}`,
          name: call.name,
          arguments: call.arguments,
        })),
        usage: step.usage ?? options.usage ?? DEFAULT_USAGE,
      };
    },
  };
}

/** The six tools this fake model uses, in the order the README lists them. */
export const TOOL_SPECS: readonly ToolSpec[] = [
  {
    name: 'find_employee',
    description: 'Tìm nhân viên theo tên hoặc phòng.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' }, department: { type: 'string' } },
      additionalProperties: false,
    },
  },
  {
    name: 'get_task',
    description: 'Xem một task theo mã.',
    inputSchema: {
      type: 'object',
      properties: { task_id: { type: 'string' } },
      required: ['task_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_tasks',
    description: 'Liệt kê task trong phạm vi đọc.',
    inputSchema: {
      type: 'object',
      properties: {
        assignee: { type: 'string' },
        department: { type: 'string' },
        status: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_request_status',
    description: 'Xem một đề xuất của chính mình.',
    inputSchema: {
      type: 'object',
      properties: { request_id: { type: 'string' } },
      required: ['request_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_task_change',
    description: 'Soạn đề xuất đổi một nhóm task.',
    inputSchema: {
      type: 'object',
      properties: {
        task_ids: { type: 'array', items: { type: 'string' } },
        changes: { type: 'object' },
      },
      required: ['task_ids', 'changes'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_employee_change',
    description: 'Soạn đề xuất đổi email công việc.',
    inputSchema: {
      type: 'object',
      properties: { employee_id: { type: 'string' }, changes: { type: 'object' } },
      required: ['employee_id', 'changes'],
      additionalProperties: false,
    },
  },
];

/** A door that answers from a table, used by tests and by the loop demo. */
export interface ScriptedDoorReply {
  readonly text: string;
  readonly reasonCode?: string | null;
  readonly isError?: boolean;
  readonly durationMs?: number;
}

export type ScriptedDoorHandler = (input: ToolCallInput) => ScriptedDoorReply;

export interface ScriptedDoor {
  readonly door: ToolDoor;
  /** Every call in order, with the turn code the loop passed. */
  readonly calls: readonly ToolCallInput[];
}

/**
 * A `ToolDoor` that answers from a handler instead of the gateway. It returns
 * the same six tool names a real door lists, so a test exercises the same
 * catalog shape without a process or a key.
 */
export function createScriptedDoor(handler: ScriptedDoorHandler): ScriptedDoor {
  const calls: ToolCallInput[] = [];
  return {
    calls,
    door: {
      name: 'scripted',
      async listTools() {
        return TOOL_SPECS;
      },
      async callTool(input) {
        calls.push(input);
        const reply = handler(input);
        return {
          text: reply.text,
          reasonCode: reply.reasonCode ?? null,
          traceId: null,
          isError: reply.isError ?? false,
          durationMs: reply.durationMs ?? 12,
        };
      },
    },
  };
}
