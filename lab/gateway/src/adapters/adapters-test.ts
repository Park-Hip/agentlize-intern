import assert from 'node:assert/strict';
import test from 'node:test';
import { actionOfField, adapterOf, createHttpAdapters, type ResourceAdapter } from './index.js';

function assertAdapter(adapter: ResourceAdapter): void {
  const names = adapter.fields.map((field) => field.name);
  assert.ok(adapter.label.length > 0, `${adapter.type} has a label`);
  assert.ok(names.includes(adapter.ownerField), `${adapter.type} declares its owner field`);
  for (const field of adapter.fields) assert.ok(field.label.length > 0, `${adapter.type}.${field.name} has a label`);

  const changed = new Set<string>();
  for (const action of adapter.actions) {
    assert.ok(action.name.length > 0, `${adapter.type} has a named action`);
    assert.ok(action.label.length > 0, `${action.name} has a console label`);
    assert.ok(action.phrase.length > 0, `${action.name} has a refusal phrase`);
    assert.ok(action.fields.length > 0, `${action.name} changes at least one field`);
    for (const field of action.fields) {
      assert.ok(names.includes(field), `${adapter.type}.${field} is a declared field`);
      changed.add(field);
    }
  }
  for (const field of changed) assert.equal(actionOfField(adapter.actions, field) !== undefined, true);
}

test('adapters: one adapter per record type, each with fields, an owner field and declared actions', () => {
  const adapters = createHttpAdapters({
    directoryUrl: 'http://127.0.0.1:1',
    tasksUrl: 'http://127.0.0.1:2',
    serviceKey: 'test-service-key',
  });

  assert.deepEqual(adapters.map((adapter) => adapter.type), ['task', 'employee']);
  for (const adapter of adapters) assertAdapter(adapter);

  const task = adapterOf(adapters, 'task');
  assert.equal(task.label, 'Task');
  assert.equal(task.ownerField, 'department');
  assert.equal(actionOfField(task.actions, 'assignee'), 'change_task_assignee_or_due');
  const employee = adapterOf(adapters, 'employee');
  assert.equal(employee.label, 'Nhân viên');
  assert.equal(actionOfField(employee.actions, 'work_email'), 'edit_work_email');
  assert.equal(actionOfField(employee.actions, 'badge'), undefined);
  assert.throws(() => adapterOf(adapters, 'invoice'), /no adapter/);
});
