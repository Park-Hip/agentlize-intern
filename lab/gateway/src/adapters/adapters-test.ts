import assert from 'node:assert/strict';
import test from 'node:test';
import { adapterOf, createHttpAdapters, type ResourceAdapter } from './index.js';

function assertAdapter(adapter: ResourceAdapter): void {
  const names = adapter.fields.map((field) => field.name);
  assert.ok(names.includes(adapter.ownerField), `${adapter.type} declares its owner field`);
  for (const field of adapter.fields) assert.ok(field.label.length > 0, `${adapter.type}.${field.name} has a label`);
  for (const field of Object.keys(adapter.changeable)) {
    assert.ok(names.includes(field), `${adapter.type}.${field} is a declared field`);
  }
}

test('adapters: one adapter per record type, each with fields, an owner field and changeable fields', () => {
  const adapters = createHttpAdapters({
    directoryUrl: 'http://127.0.0.1:1',
    tasksUrl: 'http://127.0.0.1:2',
    serviceKey: 'test-service-key',
  });

  assert.deepEqual(adapters.map((adapter) => adapter.type), ['task', 'employee']);
  for (const adapter of adapters) assertAdapter(adapter);

  const task = adapterOf(adapters, 'task');
  assert.equal(task.ownerField, 'department');
  assert.equal(task.changeable['assignee'], 'change_task_assignee_or_due');
  assert.equal(adapterOf(adapters, 'employee').changeable['work_email'], 'edit_directory');
  assert.throws(() => adapterOf(adapters, 'invoice'), /no adapter/);
});
