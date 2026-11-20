import { proxyActivities } from '@temporalio/workflow';

/**
 * One activity per write command, in the order the gateway numbered the items.
 * Temporal keeps the workflow position, so a worker that dies at item 17
 * resumes at item 17 and the activity uses the command's fixed idempotency key.
 */
const { runCommand } = proxyActivities({
  startToCloseTimeout: '2 minutes',
  heartbeatTimeout: '5 seconds',
  retry: {
    initialInterval: '500 milliseconds',
    maximumInterval: '5 seconds',
    backoffCoefficient: 2,
  },
});

/** The proposal input is only ids; content stays in the gateway command and proposal rows. */
export async function writeProposal(input) {
  const commandIds = Array.isArray(input?.commandIds) ? input.commandIds : [];
  for (const commandId of commandIds) {
    await runCommand({ commandId });
  }
  return { commands: commandIds.length };
}
