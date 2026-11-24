import assert from 'node:assert/strict';
import test from 'node:test';
import { DATA_CLASSES, DATA_CLASS_RULE_SUFFIX, exceedsCeiling } from './data-classes.js';
import { denyReasonFor, withheldFieldsReason } from './deny-reason.js';

test('data classes: a ceiling allows equal and lower classes and rejects every higher class', () => {
  for (let field = 0; field < DATA_CLASSES.length; field++) {
    for (let ceiling = 0; ceiling < DATA_CLASSES.length; ceiling++) {
      const fieldClass = DATA_CLASSES[field];
      const ceilingClass = DATA_CLASSES[ceiling];
      assert.ok(fieldClass !== undefined && ceilingClass !== undefined);
      assert.equal(
        exceedsCeiling(fieldClass, ceilingClass),
        field > ceiling,
        `${fieldClass} against ${ceilingClass}`,
      );
    }
  }
});

test('deny reasons: one mapping owns the suffix, the stale target and the catch-all', () => {
  assert.equal(DATA_CLASS_RULE_SUFFIX, '.data_class');
  assert.equal(
    denyReasonFor('NOT_PERMITTED', `employee.fields.hr${DATA_CLASS_RULE_SUFFIX}`),
    'data_class_exceeds_client',
  );
  assert.equal(denyReasonFor('TARGET_CHANGED', 'task.change_task_status.staff.scope'), 'stale_target');
  assert.equal(denyReasonFor('KEY_INVALID', 'IDENTITY.KEY_INVALID'), 'no_permission');
  assert.equal(denyReasonFor('POLICY_UNAVAILABLE', 'POLICY_UNAVAILABLE'), 'no_permission');
  assert.equal(denyReasonFor('NEEDS_APPROVAL', 'task.change_task_status.staff.bulk'), null);
  assert.equal(denyReasonFor(null, null), null);
  assert.equal(withheldFieldsReason(true, true), 'data_class_exceeds_client');
  assert.equal(withheldFieldsReason(false, true), 'no_permission');
  assert.equal(withheldFieldsReason(false, false), null);
});
