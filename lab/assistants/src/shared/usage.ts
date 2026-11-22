/** One line of the cost report the gateway stores for a conversation turn. */
export interface TurnUsage {
  readonly turnId: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
}

export interface UsageReport {
  readonly reported: boolean;
  readonly status: number | null;
}

/** The seam the loop uses to report money after a turn. */
export interface UsageReporter {
  report(usage: TurnUsage): Promise<UsageReport>;
}

export interface GatewayUsageOptions {
  readonly baseUrl: string;
  /** The typist's own `lab_` key, the same one the door uses. */
  readonly apiKey: string;
  readonly fetchImpl?: typeof fetch;
}

/**
 * Report one turn to `POST /v1/usage` (issue #106). The gateway refuses a turn
 * that has no trace line of its own, so the caller reports only after a tool
 * call. A network failure becomes `reported: false` and never throws.
 */
export function createGatewayUsageReporter(options: GatewayUsageOptions): UsageReporter {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async report(usage) {
      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}/v1/usage`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            turn_id: usage.turnId,
            model: usage.model,
            input_tokens: usage.inputTokens,
            output_tokens: usage.outputTokens,
            cost_usd: usage.costUsd,
          }),
        });
      } catch {
        return { reported: false, status: null };
      }
      await response.text();
      return { reported: response.ok, status: response.status };
    },
  };
}
