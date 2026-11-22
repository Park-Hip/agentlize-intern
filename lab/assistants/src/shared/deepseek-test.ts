import assert from 'node:assert/strict';
import test from 'node:test';
import { DEEPSEEK_MODEL, MODEL_KEY_ENV, DeepSeekClient, readModelKey } from './deepseek.js';

interface SeenRequest {
  readonly url: string;
  readonly init: RequestInit;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function captureFetch(payload: unknown): { fetchImpl: typeof fetch; seen: SeenRequest[] } {
  const seen: SeenRequest[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(url), init: init ?? {} });
    return jsonResponse(payload);
  }) as unknown as typeof fetch;
  return { fetchImpl, seen };
}

test('deepseek: the key comes only from LAB_MODEL_API_KEY and is never echoed', () => {
  assert.equal(readModelKey({ [MODEL_KEY_ENV]: 'model-key-for-tests' }), 'model-key-for-tests');
  assert.throws(
    () => readModelKey({}),
    (error: unknown) => error instanceof Error && error.message.includes(MODEL_KEY_ENV) && !error.message.includes('sk-'),
  );
  assert.throws(() => readModelKey({ [MODEL_KEY_ENV]: '   ' }), /LAB_MODEL_API_KEY/);
});

test('deepseek: one call sends deepseek-flash, thinking off, and the catalog', async () => {
  const { fetchImpl, seen } = captureFetch({
    choices: [{ message: { content: 'Xin chào', tool_calls: [] } }],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 20,
      prompt_cache_hit_tokens: 80,
      prompt_cache_miss_tokens: 20,
    },
  });
  const client = new DeepSeekClient({ apiKey: 'model-key-for-tests', fetchImpl });
  const reply = await client.complete({
    messages: [
      { role: 'system', content: 'Bạn là trợ lý.' },
      { role: 'user', content: 'Cho tôi số của anh Minh.' },
    ],
    tools: [
      {
        name: 'find_employee',
        description: 'Tìm nhân viên.',
        inputSchema: { type: 'object', properties: { name: { type: 'string' } } },
      },
    ],
  });

  assert.equal(client.name, DEEPSEEK_MODEL);
  assert.equal(reply.text, 'Xin chào');
  assert.equal(reply.toolCalls.length, 0);
  assert.deepEqual(reply.usage, {
    inputTokens: 100,
    outputTokens: 20,
    cacheHitTokens: 80,
    cacheMissTokens: 20,
  });

  assert.equal(seen.length, 1);
  const request = seen[0];
  assert.ok(request !== undefined);
  assert.equal(request.url, 'https://api.deepseek.com/chat/completions');
  assert.deepEqual((request.init.headers as Record<string, string>)['authorization'], 'Bearer model-key-for-tests');
  const body = JSON.parse(String(request.init.body)) as Record<string, unknown>;
  assert.equal(body['model'], 'deepseek-flash');
  assert.deepEqual(body['thinking'], { type: 'disabled' });
  assert.equal(body['stream'], false);
  assert.equal(Array.isArray(body['tools']), true);
});

test('deepseek: a tool call keeps its id and parsed arguments', async () => {
  const { fetchImpl } = captureFetch({
    choices: [
      {
        message: {
          content: null,
          tool_calls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'find_employee', arguments: '{"name":"Minh"}' },
            },
          ],
        },
      },
    ],
    usage: { prompt_tokens: 50, completion_tokens: 5 },
  });
  const client = new DeepSeekClient({ apiKey: 'model-key-for-tests', fetchImpl });
  const reply = await client.complete({ messages: [{ role: 'user', content: 'Tìm Minh.' }], tools: [] });

  assert.equal(reply.text, null);
  assert.deepEqual(reply.toolCalls, [
    { id: 'call-1', name: 'find_employee', arguments: { name: 'Minh' } },
  ]);
  assert.deepEqual(reply.usage, {
    inputTokens: 50,
    outputTokens: 5,
    cacheHitTokens: 0,
    cacheMissTokens: 50,
  });
});

test('deepseek: cached tokens are read from prompt_tokens_details when the flat field is absent', async () => {
  const { fetchImpl } = captureFetch({
    choices: [{ message: { content: 'ok', tool_calls: [] } }],
    usage: { prompt_tokens: 40, completion_tokens: 4, prompt_tokens_details: { cached_tokens: 30 } },
  });
  const client = new DeepSeekClient({ apiKey: 'model-key-for-tests', fetchImpl });
  const reply = await client.complete({ messages: [{ role: 'user', content: 'Chào.' }], tools: [] });
  assert.deepEqual(reply.usage, {
    inputTokens: 40,
    outputTokens: 4,
    cacheHitTokens: 30,
    cacheMissTokens: 10,
  });
});

test('deepseek: a failed call never puts the key in the error', async () => {
  const fetchImpl = (async () => new Response('upstream down', { status: 503 })) as unknown as typeof fetch;
  const client = new DeepSeekClient({ apiKey: 'model-key-for-tests', fetchImpl });
  await assert.rejects(
    client.complete({ messages: [], tools: [] }),
    (error: unknown) =>
      error instanceof Error && error.message.includes('503') && !error.message.includes('model-key-for-tests'),
  );
});

test('deepseek: arguments that are not JSON fail without printing them', async () => {
  const { fetchImpl } = captureFetch({
    choices: [
      {
        message: {
          content: null,
          tool_calls: [{ id: 'call-1', function: { name: 'find_employee', arguments: '{bad' } }],
        },
      },
    ],
  });
  const client = new DeepSeekClient({ apiKey: 'model-key-for-tests', fetchImpl });
  await assert.rejects(
    client.complete({ messages: [], tools: [] }),
    (error: unknown) => error instanceof Error && error.message.includes('tool call 1') && !error.message.includes('{bad'),
  );
});
