import type { IncomingMessage, ServerResponse } from "node:http";
import { redactHeaders, redactRawHeaders, type ProbeLogger } from "./log.js";

export const MAX_BODY_BYTES = 4 * 1024 * 1024;

export type HeaderMap = Record<string, string | string[] | number | undefined>;

export function headerValue(headers: IncomingMessage["headers"], name: string): string | undefined {
  const value = headers[name.toLowerCase()];
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value.join(", ") : String(value);
}

export function applyCors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID, Api-Key, X-Api-Key, X-User-Id, X-Agent-Id, X-Executor-Id",
  );
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id, Mcp-Protocol-Version");
  res.setHeader("Access-Control-Max-Age", "600");
  // The SDK transport writes its own headers; make sure CORS survives that write.
  const originalWriteHead = res.writeHead.bind(res);
  res.writeHead = ((statusCode: number, ...args: unknown[]) => {
    if (!res.getHeader("Access-Control-Allow-Origin")) {
      res.setHeader("Access-Control-Allow-Origin", "*");
    }
    return (originalWriteHead as (...inner: unknown[]) => ServerResponse)(statusCode, ...args);
  }) as typeof res.writeHead;
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.headersSent) return;
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(`${JSON.stringify(body)}\n`);
}

export function sendHtml(res: ServerResponse, status: number, html: string): void {
  if (res.headersSent) return;
  res.statusCode = status;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(html);
}

export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error(`body too large, limit ${MAX_BODY_BYTES} bytes`);
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export type AuthResult = {
  ok: boolean;
  reason: "no_auth_header" | "token_not_configured" | "bearer_ok" | "raw_token_ok" | "missing" | "mismatch";
  scheme: string | null;
};

export function checkAuth(req: IncomingMessage, bearer: string | undefined): AuthResult {
  const raw = headerValue(req.headers, "authorization");
  if (!bearer) {
    return {
      ok: true,
      reason: raw ? "token_not_configured" : "no_auth_header",
      scheme: raw ? raw.split(/\s+/, 1)[0] ?? null : null,
    };
  }
  if (!raw) return { ok: false, reason: "missing", scheme: null };
  const scheme = raw.split(/\s+/, 1)[0] ?? null;
  if (raw === `Bearer ${bearer}`) return { ok: true, reason: "bearer_ok", scheme };
  if (raw === bearer) return { ok: true, reason: "raw_token_ok", scheme };
  return { ok: false, reason: "mismatch", scheme };
}

export interface HttpHandle {
  port: number;
  publicBaseUrl: string;
  close: () => Promise<void>;
}

export interface HttpExchange {
  method: string;
  path: string;
  query: string;
  remoteAddress: string | undefined;
  requestHeaders: HeaderMap;
}

/**
 * Log the request line every mode shares, then hook the matching response line.
 * Both --http and --openai-provider call this, so their logs stay comparable.
 */
export function beginHttpExchange(
  req: IncomingMessage,
  res: ServerResponse,
  logger: ProbeLogger,
  startedAt: number,
  extra: Record<string, unknown> = {},
): HttpExchange {
  const method = req.method ?? "GET";
  let path = "/";
  let query = "";
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    path = url.pathname;
    query = url.search;
  } catch {
    path = req.url ?? "/";
  }
  const remoteAddress = req.socket.remoteAddress;
  const requestHeaders = req.headers as HeaderMap;

  logger.write({
    kind: "http_request",
    transport: "http",
    method,
    path,
    query,
    url: req.url ?? null,
    httpVersion: req.httpVersion,
    tls: Boolean((req.socket as unknown as { encrypted?: boolean }).encrypted),
    headers: redactHeaders(requestHeaders),
    rawHeaders: redactRawHeaders(req.rawHeaders),
    remoteAddress,
    remotePort: req.socket.remotePort ?? null,
    contentLength: req.headers["content-length"] ?? null,
    userAgent: req.headers["user-agent"] ?? null,
    sessionIdHeader: headerValue(req.headers, "mcp-session-id") ?? null,
    ...extra,
  });

  res.on("finish", () => {
    logger.write({
      kind: "http_response",
      method,
      path,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      remoteAddress,
    });
  });
  res.on("close", () => {
    if (res.writableFinished) return;
    logger.write({
      kind: "http_client_disconnect",
      method,
      path,
      durationMs: Date.now() - startedAt,
      remoteAddress,
      sessionId: headerValue(req.headers, "mcp-session-id") ?? null,
      note: "Client đóng kết nối trước khi response hoàn tất.",
    });
  });

  return { method, path, query, remoteAddress, requestHeaders };
}

export const PAGE_STYLE = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: light-dark(#f4f5f7, #101214); color: light-dark(#1b1d22, #e8eaed);
  }
  main { width: 100%; max-width: 680px; background: light-dark(#ffffff, #191c20);
    border: 1px solid light-dark(#e3e5e8, #2a2f36); border-radius: 14px; padding: 28px 28px 24px;
    box-shadow: 0 10px 30px light-dark(rgba(20, 24, 31, 0.08), rgba(0, 0, 0, 0.35)); }
  h1 { margin: 0 0 6px; font-size: 22px; line-height: 1.3; }
  p { margin: 10px 0; line-height: 1.55; }
  .sub { margin: 0 0 20px; color: light-dark(#5c636d, #a3abb5); font-size: 14px; }
  .badge { display: inline-flex; align-items: center; gap: 8px; border-radius: 999px;
    padding: 6px 12px; font-size: 13px; font-weight: 600;
    background: light-dark(#e7f6ec, #123324); color: light-dark(#11673a, #74d9a0); }
  .dot { width: 18px; height: 18px; border-radius: 50%; background: light-dark(#17a05b, #4fd48a);
    display: inline-grid; place-items: center; color: white; font-size: 12px; }
  .mono { font-family: ui-monospace, "Cascadia Code", "SFMono-Regular", Consolas, monospace; }
  .box { margin: 18px 0; padding: 14px 16px; border-radius: 10px;
    background: light-dark(#f6f7f9, #11151a); border: 1px solid light-dark(#e3e5e8, #262c34); }
  .warn { border-left: 4px solid light-dark(#e0a100, #f0c44c); padding-left: 14px; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 8px 18px; margin: 14px 0 0; font-size: 14px; }
  dt { color: light-dark(#5c636d, #a3abb5); }
  dd { margin: 0; overflow-wrap: anywhere; }
  a { color: light-dark(#0b64c9, #73b4ff); }
  code { font-size: 12.5px; overflow-wrap: anywhere; }
  .actions { margin-top: 22px; display: flex; flex-wrap: wrap; gap: 10px; }
  .actions a { text-decoration: none; font-weight: 600; font-size: 14px; border-radius: 8px;
    padding: 9px 14px; border: 1px solid light-dark(#d7dbe0, #333b45);
    background: light-dark(#fafbfc, #1e232a); color: light-dark(#1b1d22, #e8eaed); }
  .actions a.primary { background: light-dark(#11673a, #2f9e63); border-color: transparent; color: #fff; }
  footer { margin-top: 22px; font-size: 12.5px; color: light-dark(#6b737e, #98a1ac); }
`;

export function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(title)}</title>
<style>${PAGE_STYLE}</style>
</head>
<body><main>${body}</main></body>
</html>
`;
}
