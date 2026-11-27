import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

/**
 * A stand-in for the Thổ Thần server as an MCP host, so acceptance tests can
 * run without spending credit (issue #9).
 *
 * What the real host does, as measured on 2026-11-17 (see ADR-0004 and
 * `rd/research/tho-than-platform.md` section 3.6):
 * - every tool call opens a new Streamable HTTP session: `initialize`, then
 *   `tools/list` or `tools/call`, then close;
 * - the request carries `Authorization: Bearer <per-person key>`, the headers
 *   `x-user-id`, `x-user-email`, `x-agent-id` and `x-executor-id`, and the
 *   Node user agent;
 * - the host gives up at 60 seconds. The 60 second cut was measured over stdio
 *   only, not over HTTPS, so `HOST_TIMEOUT_MS` is an assumption (ADR-0004
 *   section 4).
 */

/** The cut the host applies to one call. Measured over stdio, not yet over HTTPS. */
export const HOST_TIMEOUT_MS = 60_000;

/** The MCP protocol version the probe and the SDK use. */
export const HOST_PROTOCOL_VERSION = '2025-06-18';

/** The client name the host reports while opening a session; clearly not the real one. */
export const HOST_CLIENT_INFO = { name: 'tho-than-lab-fake-host', version: '0.0.0' } as const;

/** The prefix a refusal opens with. The full text is built by the gateway. */
const REFUSAL_CODE = /\[([A-Z_]+)\]/;

export interface FakeHostOptions {
  /** The gateway address, without a trailing slash, for example `http://127.0.0.1:8790`. */
  readonly baseUrl: string;
  /** A `lab_` key of one person. */
  readonly key: string;
  /** Names the fake ids so two fake people are easy to tell apart. Defaults to `host`. */
  readonly label?: string;
  /** Overrides `x-user-id`, to show that the claimed account decides nothing (ADR-0005). */
  readonly userId?: string;
  readonly agentId?: string;
  readonly executorId?: string;
  readonly userEmail?: string;
  /** Defaults to `HOST_TIMEOUT_MS`; a test shortens it to prove the cutoff without waiting a minute. */
  readonly timeoutMs?: number;
}

/** The four identity values the host attaches. They look like the measured ones but are fake. */
export interface FakeHostIdentity {
  readonly userId: string;
  readonly agentId: string;
  readonly executorId: string;
  readonly userEmail: string;
}

/** One answer from `tools/call`, in the shape the door adapter compares. */
export interface HostAnswer {
  readonly status: number;
  readonly text: string;
  readonly reasonCode: string | null;
  readonly denyReason: string | null;
  readonly traceId: string | null;
  readonly isError: boolean;
}

/** One answer from `tools/list`. */
export interface HostCatalog {
  readonly status: number;
  readonly toolNames: readonly string[];
}

/** What one session cost, in the terms M1 will use: opening it, and the call itself. */
export interface SessionTiming {
  readonly method: 'tools/list' | 'tools/call';
  /** When the host began opening the session. */
  readonly openedAt: string;
  /** `initialize` round trip. */
  readonly sessionMs: number;
  /** `tools/list` or `tools/call` round trip. */
  readonly callMs: number;
  /** The whole session, including closing it. */
  readonly totalMs: number;
}

interface RpcReply {
  readonly error?: { readonly code?: number; readonly message?: string };
  readonly result?: {
    readonly tools?: readonly { readonly name?: string }[];
    readonly content?: readonly { readonly type?: string; readonly text?: string }[];
    readonly isError?: boolean;
    readonly _meta?: {
      readonly reason_code?: string | null;
      readonly deny_reason?: string | null;
      readonly trace_id?: string;
    };
  };
}

interface RawReply {
  readonly status: number;
  readonly sessionId: string | null;
  readonly reply: RpcReply | null;
  readonly raw: string;
}

const digest = (seed: string): string => createHash('sha256').update(`lab-fake-host:${seed}`).digest('hex').slice(0, 24);

/**
 * Stable fake ids. `user_` plus 24 characters is the shape measured on
 * 2026-11-17; all values are derived from the label, never from a real account.
 */
export function fakeHostIdentity(label = 'host'): FakeHostIdentity {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .slice(0, 40);
  return {
    userId: `user_${digest(`user:${slug}`)}`,
    agentId: `agt_${digest(`agent:${slug}`)}`,
    executorId: `exe_${digest(`executor:${slug}`)}`,
    userEmail: `${slug}@lab.example`,
  };
}

/** Read a JSON reply, or the first JSON event of an SSE reply; the gateway answers JSON today. */
function parseReply(raw: string, contentType: string | null): RpcReply | null {
  const candidate =
    contentType?.includes('text/event-stream') === true
      ? raw
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice('data:'.length).trim())
          .find((value) => value !== '' && value !== '[DONE]')
      : raw;
  if (candidate === undefined || candidate.trim() === '') return null;
  try {
    return JSON.parse(candidate) as RpcReply;
  } catch {
    return null;
  }
}

function firstLine(text: string): string {
  return text.trim().split('\n')[0]?.trim() ?? '';
}

/**
 * One fake host. Every `call` or `listTools` opens a new session and closes it
 * before resolving, so nothing outlives a call, exactly like the measured host.
 */
export class FakeThoThanHost {
  private readonly identity: FakeHostIdentity;
  private readonly timeoutMs: number;
  private readonly records: SessionTiming[] = [];
  private nextId = 0;

  constructor(private readonly options: FakeHostOptions) {
    const base = fakeHostIdentity(options.label);
    this.identity = {
      userId: options.userId ?? base.userId,
      agentId: options.agentId ?? base.agentId,
      executorId: options.executorId ?? base.executorId,
      userEmail: options.userEmail ?? base.userEmail,
    };
    this.timeoutMs = options.timeoutMs ?? HOST_TIMEOUT_MS;
  }

  /** What this host claims to be on every request. Useful in an assertion or an error message. */
  get identityValues(): FakeHostIdentity {
    return this.identity;
  }

  /** The sessions this host opened, oldest first. */
  timings(): readonly SessionTiming[] {
    return this.records;
  }

  async call(tool: string, args: unknown): Promise<HostAnswer> {
    return this.withSession('tools/call', { name: tool, arguments: args }, (status, reply, raw) =>
      this.readAnswer(status, reply, raw),
    );
  }

  async listTools(): Promise<HostCatalog> {
    return this.withSession('tools/list', {}, (status, reply) => ({
      status,
      toolNames: (reply?.result?.tools ?? [])
        .map((tool) => tool.name)
        .filter((name): name is string => typeof name === 'string'),
    }));
  }

  private async withSession<T>(
    method: SessionTiming['method'],
    params: unknown,
    read: (status: number, reply: RpcReply | null, raw: string) => T,
  ): Promise<T> {
    const openedAt = new Date().toISOString();
    const startedAt = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let sessionId: string | undefined;

    try {
      const opened = await this.post(controller.signal, {
        jsonrpc: '2.0',
        id: ++this.nextId,
        method: 'initialize',
        params: {
          protocolVersion: HOST_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: HOST_CLIENT_INFO,
        },
      });
      const sessionMs = performance.now() - startedAt;

      if (opened.status !== 200) {
        this.records.push({ method, openedAt, sessionMs, callMs: 0, totalMs: performance.now() - startedAt });
        return read(opened.status, opened.reply, opened.raw);
      }
      sessionId = opened.sessionId ?? undefined;

      const callStartedAt = performance.now();
      const answer = await this.post(
        controller.signal,
        { jsonrpc: '2.0', id: ++this.nextId, method, params },
        sessionId,
      );
      const callMs = performance.now() - callStartedAt;
      this.records.push({ method, openedAt, sessionMs, callMs, totalMs: performance.now() - startedAt });
      return read(answer.status, answer.reply, answer.raw);
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`fake host ${this.options.label ?? 'host'} gave up after ${this.timeoutMs} ms`, { cause: error });
      }
      throw error;
    } finally {
      clearTimeout(timer);
      if (sessionId !== undefined) await this.closeSession(sessionId);
    }
  }

  /** The numbers and headers a real host sends. The key decides the person; the rest is a claim. */
  private async post(signal: AbortSignal, body: unknown, sessionId?: string): Promise<RawReply> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.options.key}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'user-agent': 'node',
      'x-user-id': this.identity.userId,
      'x-agent-id': this.identity.agentId,
      'x-executor-id': this.identity.executorId,
      'x-user-email': this.identity.userEmail,
    };
    if (sessionId !== undefined) headers['mcp-session-id'] = sessionId;

    const response = await fetch(`${this.options.baseUrl.replace(/\/+$/, '')}/mcp`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });
    const raw = await response.text();
    return {
      status: response.status,
      sessionId: response.headers.get('mcp-session-id'),
      reply: parseReply(raw, response.headers.get('content-type')),
      raw,
    };
  }

  /** End a session that the server gave an id to. The Lab gateway hands out none, so this is usually skipped. */
  private async closeSession(sessionId: string): Promise<void> {
    try {
      await fetch(`${this.options.baseUrl.replace(/\/+$/, '')}/mcp`, {
        method: 'DELETE',
        headers: {
          authorization: `Bearer ${this.options.key}`,
          'mcp-session-id': sessionId,
          'user-agent': 'node',
        },
        signal: AbortSignal.timeout(1_000),
      });
    } catch {
      // A host closing a session does not fail a test; the call already has its answer.
    }
  }

  private readAnswer(status: number, reply: RpcReply | null, raw: string): HostAnswer {
    if (status !== 200) {
      const message = reply?.error?.message ?? firstLine(raw);
      return {
        status,
        text: message,
        reasonCode: REFUSAL_CODE.exec(message)?.[1] ?? null,
        denyReason: null,
        traceId: null,
        isError: true,
      };
    }

    const text = reply?.result?.content?.[0]?.text ?? '';
    return {
      status,
      text,
      reasonCode: reply?.result?._meta?.reason_code ?? REFUSAL_CODE.exec(text)?.[1] ?? null,
      denyReason: reply?.result?._meta?.deny_reason ?? null,
      traceId: reply?.result?._meta?.trace_id ?? null,
      isError: reply?.result?.isError === true,
    };
  }
}
