import assert from 'node:assert/strict';
import test from 'node:test';
import { createTarget } from './index.js';
import { verifySnapshots, waitForSettled } from './verify.js';

test('target gateway: one task is drafted, sent and written exactly once', async () => {
  const target = createTarget('gateway');
  try {
    await target.build();
    const run = await target.sendProposal({ taskIds: ['T-12'], changes: { assignee: 'NV-04' } });
    assert.equal(run.needsApproval, false, 'one task by its own department needs no lead');
    assert.equal(run.writesBeforeApproval, 0);

    await waitForSettled(target, run.proposalId, 30_000);
    const final = await target.history(['T-12']);
    assert.deepEqual(verifySnapshots(run.baseline, final, { assignee: 'NV-04' }), {
      duplicates: 0,
      lost: 0,
      wrong: 0,
    });
    assert.equal(target.observe().writeCommands, 1);
    assert.equal(target.scanTrace().hits, 0, 'the trace holds no personal value or key');
  } finally {
    await target.close();
  }
});
