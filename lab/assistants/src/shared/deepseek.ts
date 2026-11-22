import type { ToolSpec } from './door.js';
import { ModelHttpError, ModelNetworkError, ModelTimeoutError, isTimeoutError } from './errors.js';
import type { ModelClient, ModelMessage, ModelReply, ModelRequest, ModelToolCall, ModelUsage } from './model.js';

/** The one environment variable a model key may come from. It is never logged. */
export const MODEL_KEY_ENV = 'LAB_MODEL_API_KEY';

/** The model chosen in issue #102 and recorded in spec section 7.3. */
export const DEEPSEEK_MODEL = 'deepseek-flash';

export const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

/**
 * Read the model key from the environment. A missing key stops the command
 * before any call; the message never repeats a value.
 */
export function readModelKey(env: NodeJS.ProcessEnv = process.env): string {
  const key = env[MODEL_KEY_ENV]?.trim();
  if (key === undefined || key === '') {
    throw new Error(`${MODEL_KEY_ENV} is not set; the assistant reads the key only from the environment`);
  }
  return key;
}

interface DeepSeekFunctionCall {
  readonly name: string;
  readonly arguments: string;
}

interface DeepSeekToolCall {
  readonly id: string;
  readonly type?: string;
  readonly function: DeepSeekFunctionCall;
}

interface DeepSeekMessage {
  readonly role: string;
  readonly content: string;
  readonly tool_calls?: readonly DeepSeekToolCall[];
  readonly tool_call_id?: string;
}

interface DeepSeekUsage {
  readonly prompt_tokens?: number;
  readonly completion_tokens?: number;
  readonly prompt_cache_hit_tokens?: number;
  readonly prompt_cache_miss_tokens?: number;
  readonly prompt_tokens_details?: { readonly cached_tokens?: number };
}

interface DeepSeekResponse {
  readonly choices?: readonly {
    readonly message?: {
      readonly content?: string | null;
      readonly tool_calls?: readonly DeepSeekToolCall[];
    };
  }[];
  readonly usage?: DeepSeekUsage;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function toDeepSeekToolCall(call: ModelToolCall): DeepSeekToolCall {
  return {
    id: call.id,
    type: 'function',
    function: { name: call.name, arguments: JSON.stringify(call.arguments) },
  };
}

function toDeepSeekMessage(message: ModelMessage): DeepSeekMessage {
  switch (message.role) {
    case 'system':
    case 'user':
      return { role: message.role, content: message.content };
    case 'assistant':
      return {
        role: 'assistant',
        content: message.content,
        ...(message.toolCalls.length === 0 ? {} : { tool_calls: message.toolCalls.map(toDeepSeekToolCall) }),
      };
    case 'tool':
      return { role: 'tool', content: message.content, tool_call_id: message.toolCallId };
  }
}

function toDeepSeekTool(tool: ToolSpec): Record<string, unknown> {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  };
}

function parseUsage(raw: DeepSeekUsage | undefined): ModelUsage {
  const inputTokens = numberOr(raw?.prompt_tokens, 0);
  const outputTokens = numberOr(raw?.completion_tokens, 0);
  const reportedHit = raw?.prompt_cache_hit_tokens ?? raw?.prompt_tokens_details?.cached_tokens;
  const cacheHitTokens = Math.min(numberOr(reportedHit, 0), inputTokens);
  const reportedMiss = raw?.prompt_cache_miss_tokens;
  const cacheMissTokens = Math.max(0, numberOr(reportedMiss, inputTokens - cacheHitTokens));
  return { inputTokens, outputTokens, cacheHitTokens, cacheMissTokens };
}

function parseToolCall(call: DeepSeekToolCall, index: number): ModelToolCall {
  let parsed: unknown;
  try {
    parsed = JSON.parse(call.function.arguments);
  } catch {
    // The arguments can hold Lab data, so the error names only the position.
    throw new Error(`DeepSeek sent tool call ${index + 1} with arguments that are not JSON`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`DeepSeek sent tool call ${index + 1} with arguments that are not a JSON object`);
  }
  return {
    id: call.id,
    name: call.function.name,
    arguments: parsed as Readonly<Record<string, unknown>>,
  };
}

export interface DeepSeekClientOptions {
  readonly apiKey: string;
  /** Defaults to `deepseek-flash`; a test can point the client at another model. */
  readonly model?: string;
  readonly url?: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

/**
 * The DeepSeek chat-completions client. It reads the key once, sends it only
 * in the Authorization header, and never puts it in a URL, a body or an error.
 */
export class DeepSeekClient implements ModelClient {
  readonly name: string;
  private readonly apiKey: string;
  private readonly url: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: DeepSeekClientOptions) {
    if (options.apiKey.trim() === '') throw new Error('the model key must not be empty');
    this.name = options.model ?? DEEPSEEK_MODEL;
    this.apiKey = options.apiKey;
    this.url = options.url ?? DEEPSEEK_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  async complete(request: ModelRequest): Promise<ModelReply> {
    const body = {
      model: this.name,
      messages: request.messages.map(toDeepSeekMessage),
      tools: request.tools.map(toDeepSeekTool),
      tool_choice: 'auto',
      // DeepSeek has thinking on by default; Q2 turns it off (spec section 7.3).
      thinking: { type: 'disabled' },
      stream: false,
    };

    let response: Response;
    try {
      response = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (cause) {
      // A timeout and a dead endpoint get different codes; neither carries the key.
      throw isTimeoutError(cause) ? new ModelTimeoutError() : new ModelNetworkError();
    }

    if (!response.ok) {
      // Never put the key or the request body in the error: both can reach a log.
      throw new ModelHttpError(response.status);
    }

    const payload = (await response.json()) as DeepSeekResponse;
    const message = payload.choices?.[0]?.message;
    if (message === undefined) throw new Error('DeepSeek answered without a message');

    return {
      text: message.content === undefined || message.content === '' ? null : message.content,
      toolCalls: (message.tool_calls ?? []).map(parseToolCall),
      usage: parseUsage(payload.usage),
    };
  }
}
