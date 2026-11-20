import { performance } from 'node:perf_hooks';
import { newTraceId } from '../../../gateway/dist/trace/trace-store.js';
import { retryDelayMs } from '../../../gateway/dist/writes/outbox.js';

/** What a terminal outcome means for the command, the trace and the page. */
function settledOf(outcome) {
  switch (outcome.kind) {
    case 'written':
      return {
        status: 'done',
        outcome: 'ok',
        reasonCode: null,
        result: JSON.stringify({
          kind: 'written',
          status: outcome.status,
          replayed: outcome.replayed,
          version: outcome.version,
        }),
      };
    case 'target_changed':
      return {
        status: 'failed',
        outcome: 'refused',
        reasonCode: 'TARGET_CHANGED',
        result: JSON.stringify({
          kind: 'target_changed',
          status: outcome.status,
          currentVersion: outcome.currentVersion,
        }),
      };
    case 'content_changed':
      return {
        status: 'failed',
        outcome: 'refused',
        reasonCode: 'CONTENT_CHANGED',
        result: JSON.stringify({ kind: 'content_changed', status: outcome.status, error: outcome.error }),
      };
    case 'rejected':
      return {
        status: 'failed',
        outcome: 'refused',
        reasonCode: 'GATEWAY_UNAVAILABLE',
        result: JSON.stringify({ kind: 'rejected', status: outcome.status, error: outcome.error }),
      };
  }
}

/**
 * The write half of the Temporal baseline. One call is one activity attempt
 * for one gateway write command. It keeps the same command states, the same
 * idempotency key and the same adapter call as the gateway outbox; Temporal
 * only decides when the next attempt runs.
 */
export function createCommandRunner({ commands, proposals, trace, adapter, now = () => new Date() }) {
  function traceLine(command, outcome, reasonCode, ruleId, started) {
    const proposal = proposals.get(command.proposalId);
    trace.append({
      traceId: newTraceId(),
      requester: proposal?.requester ?? null,
      caller: proposal?.caller ?? null,
      entry: 'web',
      tool: 'write_command',
      objectId: command.recordId,
      outcome,
      reasonCode,
      outOfScope: false,
      ruleId,
      policyVersion: proposal?.policyVersion ?? null,
      hostUser: null,
      proposalId: command.proposalId,
      idempotencyKey: command.idempotencyKey,
      attempts: command.attempts,
      durationMs: performance.now() - started,
    });
  }

  function settle(command, outcome, ruleId, started) {
    const settled = settledOf(outcome);
    try {
      commands.settle(
        command.commandId,
        { status: settled.status, result: settled.result, reasonCode: settled.reasonCode },
        (next) => traceLine(next, settled.outcome, settled.reasonCode, ruleId, started),
      );
    } catch (error) {
      console.error(
        `[temporal-baseline] command ${command.commandId} could not record its result: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  function missing(command, reason, started) {
    console.error(`[temporal-baseline] command ${command.commandId} ${reason}`);
    settle(command, { kind: 'rejected', status: 500, error: reason }, command.attempts === 0 ? 'WRITE.SEND' : 'WRITE.RETRY', started);
  }

  /** Run or resume one command. `retry` tells the activity to let Temporal schedule another attempt. */
  async function run(commandId) {
    const command = commands.get(commandId);
    if (command === undefined) return { decision: 'missing' };
    if (command.status === 'done' || command.status === 'failed') {
      return { decision: 'done', status: command.status };
    }

    const proposal = proposals.get(command.proposalId);
    const started = performance.now();
    if (proposal === undefined) {
      missing(command, 'points at a missing proposal', started);
      return { decision: 'done', status: 'failed' };
    }
    const item = proposal.items.find((candidate) => candidate.position === command.position);
    if (item === undefined) {
      missing(command, 'points at a missing item', started);
      return { decision: 'done', status: 'failed' };
    }

    const ruleId = command.attempts === 0 ? 'WRITE.SEND' : 'WRITE.RETRY';
    let current;
    try {
      current = commands.markSent(commandId);
    } catch (error) {
      const latest = commands.get(commandId);
      if (latest?.status === 'done' || latest?.status === 'failed') return { decision: 'done', status: latest.status };
      console.error(
        `[temporal-baseline] command ${commandId} could not be marked: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { decision: 'retry' };
    }

    let result;
    try {
      result = await adapter.apply({
        id: current.recordId,
        idempotencyKey: current.idempotencyKey,
        expectedVersion: current.expectedVersion,
        changes: item.changes,
      });
    } catch (error) {
      result = { kind: 'unavailable', detail: error instanceof Error ? error.message : String(error) };
    }

    switch (result.kind) {
      case 'written':
        settle(current, { kind: 'written', status: 200, replayed: result.replayed, version: result.version }, ruleId, started);
        return { decision: 'done', status: 'done' };
      case 'conflict':
        settle(current, { kind: 'target_changed', status: 409, currentVersion: result.currentVersion }, ruleId, started);
        return { decision: 'done', status: 'failed' };
      case 'not_found':
        settle(current, { kind: 'target_changed', status: 404, currentVersion: null }, ruleId, started);
        return { decision: 'done', status: 'failed' };
      case 'rejected':
        settle(
          current,
          result.status === 422
            ? { kind: 'content_changed', status: result.status, error: result.error }
            : { kind: 'rejected', status: result.status, error: result.error },
          ruleId,
          started,
        );
        return { decision: 'done', status: 'failed' };
      case 'unavailable': {
        const retryAt = new Date(now().getTime() + retryDelayMs(current.attempts));
        try {
          commands.noteAttempt(
            current.commandId,
            JSON.stringify({ kind: 'unavailable', detail: result.detail }),
            retryAt,
            (updated) => traceLine(updated, 'error', null, ruleId, started),
          );
        } catch (error) {
          console.error(
            `[temporal-baseline] command ${current.commandId} could not note its unknown state: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
        return { decision: 'retry' };
      }
    }
  }

  return { run };
}
