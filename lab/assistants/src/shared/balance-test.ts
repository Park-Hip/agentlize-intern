import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEEPSEEK_BALANCE_URL,
  BalanceError,
  DeepSeekBalanceClient,
  createFakeBalance,
} from './balance.js';

interface SeenRequest {
  readonly url: string;
  readonly init: RequestInit;
}

function captureFetch(payload: unknown, status = 200): { fetchImpl: typeof fetch; seen: SeenRequest[] } {
  const seen: SeenRequest[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, seen };
}

function balancePayload(infos: readonly { currency: string; total_balance: string }[]): unknown {
  return { is_available: true, balance_infos: infos };
}

test('balance: the client reads the USD entry with the same key and no key in the URL', async () => {
  const { fetchImpl, seen } = captureFetch(
    balancePayload([
      { currency: 'CNY', total_balance: '7.00' },
      { currency: 'USD', total_balance: '1.10' },
    ]),
  );
  const client = new DeepSeekBalanceClient({ apiKey: 'model-key-for-tests', fetchImpl });
  assert.equal(await client.read(), 1.1);

  const request = seen[0];
  assert.ok(request !== undefined);
  assert.equal(request.url, DEEPSEEK_BALANCE_URL);
  assert.equal(request.init.method, 'GET');
  assert.equal((request.init.headers as Record<string, string>)['authorization'], 'Bearer model-key-for-tests');
});

test('balance: a response without a USD entry stops with balance_currency_missing', async () => {
  const { fetchImpl } = captureFetch(balancePayload([{ currency: 'CNY', total_balance: '7.00' }]));
  const client = new DeepSeekBalanceClient({ apiKey: 'model-key-for-tests', fetchImpl });
  await assert.rejects(client.read(), (error: unknown) => error instanceof BalanceError && error.code === 'balance_currency_missing');
});

test('balance: an HTTP failure keeps the status and never the key', async () => {
  const fetchImpl = (async () => new Response('nope', { status: 401 })) as unknown as typeof fetch;
  const client = new DeepSeekBalanceClient({ apiKey: 'model-key-for-tests', fetchImpl });
  await assert.rejects(
    client.read(),
    (error: unknown) =>
      error instanceof BalanceError
        && error.code === 'balance_http_401'
        && !error.message.includes('model-key-for-tests'),
  );
});

test('balance: a timeout, a dead endpoint and invalid JSON get safe codes', async () => {
  const timeoutFetch = (async () => {
    throw new DOMException('aborted', 'AbortError');
  }) as unknown as typeof fetch;
  await assert.rejects(
    new DeepSeekBalanceClient({ apiKey: 'model-key-for-tests', fetchImpl: timeoutFetch }).read(),
    (error: unknown) => error instanceof BalanceError && error.code === 'balance_timeout',
  );

  const networkFetch = (async () => {
    throw new TypeError('fetch failed');
  }) as unknown as typeof fetch;
  await assert.rejects(
    new DeepSeekBalanceClient({ apiKey: 'model-key-for-tests', fetchImpl: networkFetch }).read(),
    (error: unknown) => error instanceof BalanceError && error.code === 'balance_unavailable',
  );

  const badJsonFetch = (async () => new Response('not json', { status: 200 })) as unknown as typeof fetch;
  await assert.rejects(
    new DeepSeekBalanceClient({ apiKey: 'model-key-for-tests', fetchImpl: badJsonFetch }).read(),
    (error: unknown) => error instanceof BalanceError && error.code === 'balance_invalid',
  );
});

test('balance: the fake returns the scripted readings and counts them', async () => {
  const fake = createFakeBalance([1, 0.5, new BalanceError('balance_unavailable')]);
  assert.equal(fake.reads, 0);
  assert.equal(await fake.read(), 1);
  assert.equal(await fake.read(), 0.5);
  await assert.rejects(fake.read(), (error: unknown) => error instanceof BalanceError && error.code === 'balance_unavailable');
  assert.equal(fake.reads, 3);
});
