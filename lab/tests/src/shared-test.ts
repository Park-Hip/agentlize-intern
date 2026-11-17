import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_PORTS,
  GATEWAY_UNAVAILABLE,
  POLICY_REASON_CODES,
  PORT_ENV,
  REASON_CODES,
  REFUSAL_PREFIX,
  refusalMessage,
  resolvePort,
  toolResponseSchema,
} from '@lab/shared';

test('shared: ten policy codes plus the gateway code', () => {
  assert.equal(POLICY_REASON_CODES.length, 10);
  assert.equal(REASON_CODES.length, 11);
  assert.equal(new Set(REASON_CODES).size, 11);
  assert.deepEqual([...REASON_CODES], [...POLICY_REASON_CODES, GATEWAY_UNAVAILABLE]);
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

test('shared: tool response carries text, reason_code and trace_id', () => {
  const parsed = toolResponseSchema.parse({
    text: 'Đã ghi',
    reason_code: null,
    trace_id: 'trace-01',
    extra: 'must be dropped',
  });
  assert.deepEqual(Object.keys(parsed).sort(), ['reason_code', 'text', 'trace_id']);
  assert.equal(parsed.reason_code, null);

  assert.throws(() => toolResponseSchema.parse({ text: '', reason_code: null, trace_id: 'trace-01' }));
  assert.throws(() => toolResponseSchema.parse({ text: 'x', reason_code: 'NOT_A_CODE', trace_id: 'trace-01' }));
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
