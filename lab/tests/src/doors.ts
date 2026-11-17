import type { ToolResponse } from '@lab/shared';
import { FakeThoThanHost } from './fake-host.js';

/**
 * The ways into the gateway the acceptance tests use (issue #13, issue #15).
 * `http` is the API a function-calling assistant uses, `mcp-http` speaks
 * JSON-RPC to `/mcp` directly, and `tho-than-host` opens a session per call
 * the way the Thổ Thần server does. Every door must give the same answer to
 * the same question (SR8).
 */
export interface Answer {
  readonly status: number;
  readonly text: string;
  readonly reasonCode: string | null;
  readonly traceId: string | null;
}

export interface Door {
  readonly name: string;
  /** The `entry` column the trace keeps for calls through this door. */
  readonly traceEntry: 'http' | 'mcp';
  /** `hostUser` is the `x-user-id` a host attaches; it must never decide the answer (ADR-0005). */
  call(base: string, tool: string, args: unknown, key: string, hostUser?: string): Promise<Answer>;
  toolNames(base: string, key: string): Promise<string[]>;
}

export const REFUSAL_CODE = /^CHƯA THỰC HIỆN \[([A-Z_]+)\]/;

const restDoor: Door = {
  name: 'http',
  traceEntry: 'http',
  async call(base, tool, args, key, hostUser) {
    const response = await fetch(`${base}/v1/tools/${tool}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        ...(hostUser === undefined ? {} : { 'x-user-id': hostUser }),
      },
      body: JSON.stringify(args),
    });
    const body = (await response.json()) as ToolResponse;
    return { status: response.status, text: body.text, reasonCode: body.reason_code, traceId: body.trace_id };
  },
  async toolNames(base) {
    const catalog = (await (await fetch(`${base}/v1/tools`)).json()) as { tools: { name: string }[] };
    return catalog.tools.map((tool) => tool.name);
  },
};

/** One JSON-RPC request per call on a fresh connection, without the initialize step. */
interface RpcReply {
  readonly error?: { readonly message: string };
  readonly result?: {
    readonly content?: readonly { readonly text: string }[];
    readonly tools?: readonly { readonly name: string }[];
    readonly _meta?: { readonly reason_code: string | null; readonly trace_id?: string };
  };
}

async function rpc(
  base: string,
  key: string,
  method: string,
  params: unknown,
  hostUser?: string,
): Promise<{ status: number; json: RpcReply }> {
  const response = await fetch(`${base}/mcp`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(hostUser === undefined ? {} : { 'x-user-id': hostUser }),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  return { status: response.status, json: (await response.json()) as RpcReply };
}

const mcpHttpDoor: Door = {
  name: 'mcp-http',
  traceEntry: 'mcp',
  async call(base, tool, args, key, hostUser) {
    const { status, json } = await rpc(base, key, 'tools/call', { name: tool, arguments: args }, hostUser);
    if (status !== 200) {
      const text = json.error?.message ?? '';
      return { status, text, reasonCode: REFUSAL_CODE.exec(text)?.[1] ?? null, traceId: null };
    }
    return {
      status,
      text: json.result?.content?.[0]?.text ?? '',
      reasonCode: json.result?._meta?.reason_code ?? null,
      traceId: json.result?._meta?.trace_id ?? null,
    };
  },
  async toolNames(base, key) {
    const { json } = await rpc(base, key, 'tools/list', {});
    return (json.result?.tools ?? []).map((tool) => tool.name);
  },
};

/**
 * The third door: a client that behaves like the Thổ Thần server, not a bare
 * fetch. It opens a session for every call, sends the four identity headers and
 * the Node user agent, and gives up at 60 seconds (issue #9).
 */
const thoThanHostDoor: Door = {
  name: 'tho-than-host',
  traceEntry: 'mcp',
  async call(base, tool, args, key, hostUser) {
    const host = new FakeThoThanHost({
      baseUrl: base,
      key,
      label: 'tho-than-host',
      ...(hostUser === undefined ? {} : { userId: hostUser }),
    });
    return host.call(tool, args);
  },
  async toolNames(base, key) {
    const host = new FakeThoThanHost({ baseUrl: base, key, label: 'tho-than-host' });
    return [...(await host.listTools()).toolNames];
  },
};

export const DOORS: readonly Door[] = [restDoor, mcpHttpDoor, thoThanHostDoor];
