import { isTimeoutError } from './errors.js';

export const DEEPSEEK_BALANCE_URL = 'https://api.deepseek.com/user/balance';

/** The spending guard from spec section 7.3: stop when the USD balance is under this. */
export const MIN_BALANCE_USD = 0.2;

/** Read the balance after this many conversations, as the spec requires. */
export const BALANCE_CHECK_EVERY = 10;

/** Reads the DeepSeek USD balance. Throws `BalanceError` when it cannot. */
export interface BalanceClient {
  read(): Promise<number>;
}

/** A failed balance read with a short code safe for a result file. */
export class BalanceError extends Error {
  constructor(readonly code: string) {
    super(`balance read failed: ${code}`);
    this.name = 'BalanceError';
  }
}

interface BalanceResponse {
  readonly balance_infos?: readonly {
    readonly currency?: string;
    readonly total_balance?: string | number;
  }[];
}

export interface DeepSeekBalanceOptions {
  readonly apiKey: string;
  readonly url?: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

/**
 * `GET /user/balance` with the same key as the model, read before the first run
 * and after every ten conversations (issue #107 review, spec section 7.3).
 * Only the USD entry is used: the 0.20 threshold is USD and no exchange rate is
 * guessed. A key or a response body never appears in an error.
 */
export class DeepSeekBalanceClient implements BalanceClient {
  private readonly apiKey: string;
  private readonly url: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: DeepSeekBalanceOptions) {
    if (options.apiKey.trim() === '') throw new Error('the model key must not be empty');
    this.apiKey = options.apiKey;
    this.url = options.url ?? DEEPSEEK_BALANCE_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async read(): Promise<number> {
    let response: Response;
    try {
      response = await this.fetchImpl(this.url, {
        method: 'GET',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          accept: 'application/json',
        },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (cause) {
      throw new BalanceError(isTimeoutError(cause) ? 'balance_timeout' : 'balance_unavailable');
    }

    if (!response.ok) throw new BalanceError(`balance_http_${Math.trunc(response.status)}`);

    let payload: BalanceResponse;
    try {
      payload = (await response.json()) as BalanceResponse;
    } catch {
      throw new BalanceError('balance_invalid');
    }

    const infos = payload.balance_infos;
    if (!Array.isArray(infos)) throw new BalanceError('balance_invalid');

    const usd = infos.find(
      (info) => typeof info === 'object' && info !== null && String(info.currency).toUpperCase() === 'USD',
    );
    if (usd === undefined) throw new BalanceError('balance_currency_missing');

    const raw = usd.total_balance;
    if (typeof raw !== 'string' && typeof raw !== 'number') throw new BalanceError('balance_invalid');
    if (typeof raw === 'string' && raw.trim() === '') throw new BalanceError('balance_invalid');
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) throw new BalanceError('balance_invalid');
    return amount;
  }
}

export interface FakeBalance extends BalanceClient {
  /** How many times `read` was called. */
  readonly reads: number;
}

/**
 * A scripted balance for tests. Each read returns the next value; the list
 * repeats at its last value. A `BalanceError` entry makes that read fail.
 */
export function createFakeBalance(readings: readonly (number | BalanceError)[]): FakeBalance {
  let index = 0;
  return {
    get reads() {
      return index;
    },
    async read() {
      const value = readings[Math.min(index, readings.length - 1)];
      index += 1;
      if (value === undefined) throw new BalanceError('balance_unavailable');
      if (value instanceof BalanceError) throw value;
      return value;
    },
  };
}
