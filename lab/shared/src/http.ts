import type { IncomingMessage, ServerResponse } from 'node:http';

/** Request bodies larger than this are refused, so a bad client cannot fill memory. */
export const MAX_BODY_BYTES = 64 * 1024;

export function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Readonly<Record<string, string>> = {},
): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(`${JSON.stringify(body)}\n`);
}

/** Thrown by `readJsonBody` so a route can turn it into a 4xx answer. */
export class BodyError extends Error {
  constructor(
    readonly status: 400 | 413,
    readonly code: 'invalid_json' | 'body_too_large',
  ) {
    super(code);
  }
}

/** Read and parse a JSON request body. An empty body is an `invalid_json` error. */
export async function readJsonBody(req: IncomingMessage, limit: number = MAX_BODY_BYTES): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer);
    size += buffer.length;
    if (size > limit) {
      throw new BodyError(413, 'body_too_large');
    }
    chunks.push(buffer);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new BodyError(400, 'invalid_json');
  }
}
