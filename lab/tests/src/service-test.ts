import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { SERVICE_KEY_ENV, startService } from '@lab/shared';

test('service: starts on loopback, serves /health and rejects other routes', async (t) => {
  const key = randomBytes(32).toString('base64url');
  const running = await startService({
    service: 'gateway',
    port: 0,
    env: { [SERVICE_KEY_ENV]: key },
  });
  t.after(() => running.close());

  assert.equal(running.url, `http://127.0.0.1:${running.port}`);

  const health = await fetch(`${running.url}/health`);
  assert.equal(health.status, 200);
  assert.match(health.headers.get('content-type') ?? '', /^application\/json/);
  assert.deepEqual(await health.json(), { status: 'ok', service: 'gateway' });

  const missing = await fetch(`${running.url}/nope`);
  assert.equal(missing.status, 404);

  const wrongMethod = await fetch(`${running.url}/health`, { method: 'POST' });
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('allow'), 'GET');
});

test('service: refuses to start without a service key', async () => {
  await assert.rejects(startService({ service: 'gateway', port: 0, env: {} }), /LAB_SERVICE_KEY/);
});
