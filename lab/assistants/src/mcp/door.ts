import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { DoorContext, DoorFactory, ToolCallInput, ToolCallResult, ToolDoor, ToolSpec } from '../shared/door.js';

/**
 * Assistant A's door: a real MCP client over Streamable HTTP (issue #108).
 * It speaks the same protocol as the Thổ Thần host, so the gateway sees the
 * same `initialize`, `tools/list` and `tools/call` requests from both.
 *
 * The gateway keeps no session, so one door operation opens a transport, runs
 * its request and closes it again. That is what the measured host does per tool
 * call (ADR-0004), and it keeps the turn code of one call apart from the next.
 */

/** The client name the gateway could report; it never decides who the caller is. */
const CLIENT_INFO = { name: 'lab-assistant-a', version: '0.0.0' } as const;

/** The host gives up at 60 seconds (ADR-0004); the Lab's own door uses the same cut. */
export const MCP_CALL_TIMEOUT_MS = 60_000;

/** A refusal opens with this prefix; `_meta.reason_code` is the normal path. */
const REFUSAL_CODE = /^CHƯA THỰC HIỆN \[([A-Z_]+)\]/;

export interface McpDoorOptions extends DoorContext {
  /** Shortened by a test, never by the command. */
  readonly timeoutMs?: number;
}

function mcpUrl(baseUrl: string): URL {
  const root = baseUrl.trim().replace(/\/+$/, '');
  return new URL(`${root}/mcp`);
}

/** Read one string field from a result's `_meta`, which the SDK types as unknown. */
function metaString(meta: Readonly<Record<string, unknown>> | undefined, key: string): string | null {
  const value = meta?.[key];
  return typeof value === 'string' ? value : null;
}

function textOf(content: unknown): string {
  if (!Array.isArray(content)) return '';
  for (const part of content) {
    if (typeof part !== 'object' || part === null) continue;
    const { type, text } = part as { readonly type?: unknown; readonly text?: unknown };
    if (type === 'text' && typeof text === 'string') return text;
  }
  return '';
}

class McpDoor implements ToolDoor {
  readonly name = 'mcp';
  private readonly url: URL;
  private readonly toolKey: string;
  private readonly timeoutMs: number;

  constructor(options: McpDoorOptions) {
    if (options.toolKey.trim() === '') throw new Error('the mcp door needs a tool key');
    this.url = mcpUrl(options.baseUrl);
    this.toolKey = options.toolKey;
    this.timeoutMs = options.timeoutMs ?? MCP_CALL_TIMEOUT_MS;
  }

  /**
   * One initialized client on its own transport. The key and the turn code are
   * headers, never query parameters, so neither reaches a URL that a log keeps.
   */
  private async connect(turnId?: string): Promise<Client> {
    const transport = new StreamableHTTPClientTransport(this.url, {
      requestInit: {
        headers: {
          authorization: `Bearer ${this.toolKey}`,
          ...(turnId === undefined ? {} : { 'x-lab-turn': turnId }),
        },
      },
    });
    const client = new Client(CLIENT_INFO, { capabilities: {} });
    try {
      await client.connect(transport);
    } catch (cause) {
      await client.close();
      throw new Error('the gateway did not accept the MCP connection', { cause });
    }
    return client;
  }

  /** The catalog comes from `tools/list`; nothing here names a tool. */
  async listTools(): Promise<readonly ToolSpec[]> {
    const client = await this.connect();
    try {
      const answer = await client.listTools(undefined, { timeout: this.timeoutMs });
      return answer.tools.map((tool) => ({
        name: tool.name,
        description: tool.description ?? '',
        inputSchema: tool.inputSchema as Readonly<Record<string, unknown>>,
      }));
    } finally {
      await client.close();
    }
  }

  /** One tool call with the turn code of the conversation that asked for it. */
  async callTool(input: ToolCallInput): Promise<ToolCallResult> {
    const startedAt = performance.now();
    const client = await this.connect(input.turnId);
    try {
      const answer = await client.callTool(
        { name: input.name, arguments: input.args },
        undefined,
        { timeout: this.timeoutMs },
      );
      const text = textOf(answer.content);
      const meta = answer._meta;
      return {
        text,
        reasonCode: metaString(meta, 'reason_code') ?? REFUSAL_CODE.exec(text)?.[1] ?? null,
        traceId: metaString(meta, 'trace_id'),
        isError: answer.isError === true,
        durationMs: performance.now() - startedAt,
      };
    } finally {
      await client.close();
    }
  }
}

/** `npm run assistant -- --door mcp` loads this factory. */
export const createDoor: DoorFactory = (context) => new McpDoor(context);
