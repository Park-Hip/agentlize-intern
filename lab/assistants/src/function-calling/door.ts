import { performance } from 'node:perf_hooks';
import type { DoorContext, DoorFactory, ToolCallResult, ToolDoor } from '../shared/door.js';
import { TOOL_DECLARATIONS } from './tools.js';

/** How long one tool call may take before the door gives up and the loop records a door error. */
export const REQUEST_TIMEOUT_MS = 30_000;

interface ToolAnswer {
  readonly text: string;
  readonly reasonCode: string | null;
  readonly traceId: string | null;
}

function optionalString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new Error(`the gateway answered with a non-string ${field}`);
  return value;
}

/** Read `{ text, reason_code, trace_id }` without keeping the raw body, which may hold personal data. */
function parseAnswer(raw: string, status: number): ToolAnswer {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(`the gateway answered HTTP ${status} without a JSON tool response`);
  }
  if (typeof value !== 'object' || value === null) {
    throw new Error(`the gateway answered HTTP ${status} without a JSON tool response`);
  }
  const body = value as Record<string, unknown>;
  if (typeof body['text'] !== 'string') {
    throw new Error(`the gateway answered HTTP ${status} without a tool answer`);
  }
  return {
    text: body['text'],
    reasonCode: optionalString(body['reason_code'], 'reason_code'),
    traceId: optionalString(body['trace_id'], 'trace_id'),
  };
}

/**
 * Assistant B's door: the usual way to connect an assistant when there is no
 * shared protocol. It declares the seven tools itself (`tools.ts`) and calls
 * `POST /v1/tools/<name>` with the typist's own key and the turn code, exactly
 * as a hand-written integration would (issue #109). The key already names the
 * typist, so `employeeId` is not sent as a second, conflicting claim.
 */
export const createDoor: DoorFactory = (context: DoorContext): ToolDoor => {
  const baseUrl = context.baseUrl.replace(/\/+$/, '');

  return {
    name: 'function',
    async listTools() {
      return TOOL_DECLARATIONS;
    },
    async callTool(input) {
      const started = performance.now();
      let response: Response;
      try {
        response = await fetch(`${baseUrl}/v1/tools/${encodeURIComponent(input.name)}`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${context.toolKey}`,
            'content-type': 'application/json',
            accept: 'application/json',
            'x-lab-turn': input.turnId,
          },
          body: JSON.stringify(input.args),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (cause) {
        const timedOut = cause instanceof Error && cause.name === 'TimeoutError';
        // Never attach the cause: a fetch error can name the request, and the key must not travel with it.
        throw new Error(
          timedOut
            ? `the gateway did not answer within ${REQUEST_TIMEOUT_MS} ms`
            : 'the gateway could not be reached',
        );
      }

      const answer = parseAnswer(await response.text(), response.status);
      const result: ToolCallResult = {
        text: answer.text,
        reasonCode: answer.reasonCode,
        traceId: answer.traceId,
        // A refusal or a bad request is an error to the model; "not found" and
        // "needs approval" arrive as 200 answers and stay answers.
        isError: !response.ok,
        durationMs: performance.now() - started,
      };
      return result;
    },
  };
};
