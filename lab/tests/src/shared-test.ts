import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_PORTS,
  GATEWAY_UNAVAILABLE,
  PENDING_LIMIT,
  POLICY_REASON_CODES,
  PORT_ENV,
  REASON_CODES,
  REFUSAL_PREFIX,
  refusalMessage,
  resolvePort,
  toolResponseSchema,
} from '@lab/shared';

test('shared: ten policy codes, the gateway code and the pending cap code', () => {
  assert.equal(POLICY_REASON_CODES.length, 10);
  assert.equal(REASON_CODES.length, 12);
  assert.equal(new Set(REASON_CODES).size, 12);
  assert.deepEqual([...REASON_CODES], [...POLICY_REASON_CODES, GATEWAY_UNAVAILABLE, PENDING_LIMIT]);
});

test('shared: refusal text keeps the fixed prefix and one line', () => {
  for (const code of REASON_CODES) {
    assert.equal(
      refusalMessage(code, '  Bạn không có quyền.\nHỏi anh Quang.  '),
      `${REFUSAL_PREFIX} [${code}] Bạn không có quyền. Hỏi anh Quang.`,
    );
  }

  assert.throws(() => refusalMessage('NOT_PERMITTED', '   '), /one Vietnamese sentence/);
});

test('shared: tool response carries the gateway status and the two free-text flags', () => {
  const parsed = toolResponseSchema.parse({
    text: 'Đã ghi',
    reason_code: null,
    deny_reason: null,
    gateway_status: 'executed',
    untrusted_content: true,
    truncated: false,
    trace_id: 'trace-01',
    extra: 'must be dropped',
  });
  assert.deepEqual(Object.keys(parsed).sort(), [
    'deny_reason',
    'gateway_status',
    'reason_code',
    'text',
    'trace_id',
    'truncated',
    'untrusted_content',
  ]);
  assert.equal(parsed.gateway_status, 'executed');
  assert.equal(parsed.untrusted_content, true);
  assert.equal(parsed.truncated, false);

  // An older answer without the three newer keys still parses, so a client
  // built before them keeps working.
  const older = toolResponseSchema.parse({ text: 'Đã ghi', reason_code: null, deny_reason: null, trace_id: 'trace-01' });
  assert.equal(older.gateway_status, undefined);
  assert.equal(older.untrusted_content, undefined);

  assert.throws(() =>
    toolResponseSchema.parse({ text: '', reason_code: null, deny_reason: null, trace_id: 'trace-01' }),
  );
  assert.throws(() =>
    toolResponseSchema.parse({ text: 'x', reason_code: 'NOT_A_CODE', deny_reason: null, trace_id: 'trace-01' }),
  );
  assert.throws(() =>
    toolResponseSchema.parse({ text: 'x', reason_code: null, deny_reason: 'NOT_A_REASON', trace_id: 'trace-01' }),
  );
  assert.throws(() =>
    toolResponseSchema.parse({
      text: 'x',
      reason_code: null,
      deny_reason: null,
      gateway_status: 'unknown',
      trace_id: 'trace-01',
    }),
  );
});

test('shared: ports have defaults and can be overridden', () => {
  assert.deepEqual(DEFAULT_PORTS, { gateway: 8790, directory: 8791, tasks: 8792, console: 8793 });
  assert.equal(resolvePort('gateway', {}), 8790);
  assert.equal(resolvePort('directory', {}), 8791);
  assert.equal(resolvePort('console', {}), 8793);
  assert.equal(resolvePort('tasks', { [PORT_ENV.tasks]: '9912' }), 9912);
  assert.equal(resolvePort('console', { [PORT_ENV.console]: '9913' }), 9913);
  assert.throws(() => resolvePort('tasks', { [PORT_ENV.tasks]: '0' }), /LAB_TASKS_PORT/);
  assert.throws(() => resolvePort('gateway', { [PORT_ENV.gateway]: 'http' }), /LAB_GATEWAY_PORT/);
});
