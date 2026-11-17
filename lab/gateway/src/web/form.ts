import type { IncomingMessage } from 'node:http';

/** A form here holds a few short fields; anything larger is not one of ours. */
export const MAX_FORM_BYTES = 8 * 1024;

/**
 * Read a browser form (`application/x-www-form-urlencoded`). Returns undefined
 * for another content type, a body that is too large, or one that cannot be read.
 */
export async function readForm(req: IncomingMessage): Promise<URLSearchParams | undefined> {
  const type = req.headers['content-type'] ?? '';
  if (!type.toLowerCase().startsWith('application/x-www-form-urlencoded')) return undefined;

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer);
    size += buffer.length;
    if (size > MAX_FORM_BYTES) return undefined;
    chunks.push(buffer);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}
