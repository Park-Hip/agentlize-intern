import { LOOPBACK_HOST, resolvePort, type ServiceName } from '@lab/shared';
import { z } from 'zod';
import type { ApplyResult, RecordData } from './types.js';

/** A fake system did not answer in a way the gateway can use. */
export class SystemUnavailableError extends Error {
  constructor(
    readonly system: string,
    detail: string,
  ) {
    super(`${system}: ${detail}`);
  }
}

/** Calls to a fake system stop after this long, well inside the host's 60 second cut. */
export const DEFAULT_SYSTEM_TIMEOUT_MS = 5_000;

export function systemUrl(service: ServiceName, env: NodeJS.ProcessEnv = process.env): string {
  return `http://${LOOPBACK_HOST}:${resolvePort(service, env)}`;
}

export interface HttpSystemOptions {
  readonly url: string;
  readonly serviceKey: string;
  readonly timeoutMs?: number;
  readonly fetch?: typeof fetch;
}

/** Reads one fake system over HTTP with the service key. Nothing is cached. */
export class HttpSystem {
  private readonly timeoutMs: number;
  private readonly doFetch: typeof fetch;

  constructor(
    readonly service: string,
    private readonly options: HttpSystemOptions,
  ) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_SYSTEM_TIMEOUT_MS;
    this.doFetch = options.fetch ?? fetch;
  }

  /** Returns the JSON body, or undefined for a status listed in `absent`. Anything else that is not 200 throws. */
  async get(path: string, absent: readonly number[] = []): Promise<unknown> {
    let response: Response;
    let text: string;
    try {
      response = await this.doFetch(`${this.options.url}${path}`, {
        headers: { authorization: `Bearer ${this.options.serviceKey}` },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      text = await response.text();
    } catch (error) {
      const reason = error instanceof Error ? error.name : 'error';
      throw new SystemUnavailableError(this.service, `request failed (${reason})`);
    }

    if (absent.includes(response.status)) return undefined;
    if (response.status !== 200) throw new SystemUnavailableError(this.service, `HTTP ${response.status}`);
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new SystemUnavailableError(this.service, 'reply is not JSON');
    }
  }

  /**
   * One PATCH with the fixed key. A dropped connection, a timeout or a 5xx
   * answer is `unavailable`: the gateway must keep the command and try again
   * with the same key rather than guess.
   */
  async patch(
    path: string,
    payload: unknown,
    idempotencyKey: string,
    recordOf: (body: unknown) => RecordData | undefined,
  ): Promise<ApplyResult> {
    let response: Response;
    let text: string;
    try {
      response = await this.doFetch(`${this.options.url}${path}`, {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${this.options.serviceKey}`,
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      text = await response.text();
    } catch (error) {
      const reason = error instanceof Error ? error.name : 'error';
      return { kind: 'unavailable', detail: `request failed (${reason})` };
    }

    if (response.status === 409) {
      let currentVersion: number | null = null;
      try {
        const body = JSON.parse(text) as { current_version?: unknown };
        if (typeof body.current_version === 'number') currentVersion = body.current_version;
      } catch {
        // The conflict is still a conflict; the version is only extra detail.
      }
      return { kind: 'conflict', currentVersion };
    }
    if (response.status === 404) return { kind: 'not_found' };
    if (response.status >= 500) return { kind: 'unavailable', detail: `HTTP ${response.status}` };
    if (response.status < 200 || response.status >= 300) {
      return { kind: 'rejected', status: response.status, error: errorText(text) };
    }

    let body: unknown;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      return { kind: 'unavailable', detail: 'reply is not JSON' };
    }
    const record = recordOf(body);
    if (record === undefined) return { kind: 'unavailable', detail: 'reply has an unexpected shape' };
    const version = record['version'];
    if (typeof version !== 'number') return { kind: 'unavailable', detail: 'reply has no version' };
    return { kind: 'written', record, version, replayed: response.headers.get('idempotent-replayed') === 'true' };
  }

  /**
   * One POST with the fixed key, for a create. The target answers with the new
   * record, and the adapter names the field that holds its code. A create has
   * no version: the key is the only repeat guard, and a 409 means the target
   * refused a key it had already seen with another answer.
   */
  async post(
    path: string,
    payload: unknown,
    idempotencyKey: string | undefined,
    recordOf: (body: unknown) => RecordData | undefined,
    idOf: (record: RecordData) => string | undefined,
  ): Promise<ApplyResult> {
    let response: Response;
    let text: string;
    try {
      response = await this.doFetch(`${this.options.url}${path}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.options.serviceKey}`,
          'content-type': 'application/json',
          ...(idempotencyKey === undefined ? {} : { 'idempotency-key': idempotencyKey }),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      text = await response.text();
    } catch (error) {
      const reason = error instanceof Error ? error.name : 'error';
      return { kind: 'unavailable', detail: `request failed (${reason})` };
    }

    if (response.status === 404) return { kind: 'not_found' };
    if (response.status >= 500) return { kind: 'unavailable', detail: `HTTP ${response.status}` };
    if (response.status < 200 || response.status >= 300) {
      return { kind: 'rejected', status: response.status, error: errorText(text) };
    }

    let body: unknown;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      return { kind: 'unavailable', detail: 'reply is not JSON' };
    }
    const record = recordOf(body);
    if (record === undefined) return { kind: 'unavailable', detail: 'reply has an unexpected shape' };
    const recordId = idOf(record);
    if (recordId === undefined) return { kind: 'unavailable', detail: 'reply has no record code' };
    return {
      kind: 'created',
      record,
      recordId,
      replayed: response.headers.get('idempotent-replayed') === 'true',
    };
  }

  parse<S extends z.ZodType>(schema: S, body: unknown): z.infer<S> {
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new SystemUnavailableError(this.service, 'reply has an unexpected shape');
    return parsed.data;
  }
}

/** The `error` field of a refusal from a fake system, for the command's saved result. */
function errorText(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    return typeof parsed.error === 'string' ? parsed.error : 'unexpected_reply';
  } catch {
    return 'unexpected_reply';
  }
}
