import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Header names whose values must never land in a log file.
 * The brief only requires Authorization, the rest are cheap insurance.
 */
const SENSITIVE_HEADERS = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
]);

export type HeaderBag = Record<string, string | string[] | number | undefined>;

/** First 6 characters plus the original length. Short values are hidden completely. */
export function redactSecret(value: string): string {
  if (value.length <= 8) return `***...(len=${value.length})`;
  return `${value.slice(0, 6)}...(len=${value.length})`;
}

/**
 * Environment variables whose name starts with LAB_, redacted like a secret.
 * A host that lets each user set their own env var (stdio form) could carry a per-user key this way.
 * Other variables are never read, so the probe cannot leak the machine's environment.
 */
export function labEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (name.startsWith("LAB_") && typeof value === "string") out[name] = redactSecret(value);
  }
  return out;
}

export function redactHeaders(headers: HeaderBag | Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!headers) return out;
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (!SENSITIVE_HEADERS.has(name.toLowerCase())) {
      out[name] = value;
      continue;
    }
    out[name] = Array.isArray(value)
      ? value.map((item) => redactSecret(String(item)))
      : redactSecret(String(value));
  }
  return out;
}

/** rawHeaders keeps duplicates and original casing, so it needs the same treatment. */
export function redactRawHeaders(raw: string[] | undefined): string[] | undefined {
  if (!raw) return undefined;
  const out: string[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    const name = raw[i] ?? "";
    const value = raw[i + 1] ?? "";
    out.push(name, SENSITIVE_HEADERS.has(name.toLowerCase()) ? redactSecret(value) : value);
  }
  return out;
}

/** Walk up from a directory until the repo root (AGENTS.md or .git) is found. */
export function findRepoRoot(start: string): string {
  let current = resolve(start);
  for (;;) {
    if (existsSync(join(current, "AGENTS.md")) || existsSync(join(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return resolve(start);
    current = parent;
  }
}

function fileStamp(date: Date): string {
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
    "-",
    pad(date.getMilliseconds(), 3),
  ].join("");
}

export interface LoggerOptions {
  transport: "stdio" | "http";
  logDir?: string;
  config: Record<string, unknown>;
}

/**
 * Appends one JSON object per line to scratch/mcp-probe/log-<timestamp>.jsonl.
 * Writes are synchronous on purpose: a probe must not lose the last line on exit.
 */
export class ProbeLogger {
  readonly file: string;

  constructor(options: LoggerOptions) {
    const moduleDir = dirname(fileURLToPath(import.meta.url));
    const dir = options.logDir
      ? resolve(options.logDir)
      : resolve(findRepoRoot(moduleDir), "scratch", "mcp-probe");
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, `log-${fileStamp(new Date())}.jsonl`);
    process.stderr.write(`[mcp-probe] transport=${options.transport}\n`);
    process.stderr.write(`[mcp-probe] log file: ${this.file}\n`);
    this.write({
      kind: "server_start",
      transport: options.transport,
      pid: process.pid,
      node: process.version,
      platform: process.platform,
      cwd: process.cwd(),
      labEnv: labEnv(),
      logFile: this.file,
      config: options.config,
    });
  }

  write(entry: Record<string, unknown>): void {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
    try {
      appendFileSync(this.file, `${line}\n`, "utf8");
    } catch (error) {
      process.stderr.write(`[mcp-probe] log write failed: ${String(error)}\n`);
    }
    this.mirror(entry);
  }

  /** Short human-readable mirror on stderr. Full detail lives in the JSONL file only. */
  private mirror(entry: Record<string, unknown>): void {
    const kind = entry.kind;
    if (kind === "jsonrpc") {
      const message = entry.message as
        | { method?: string; id?: string | number; params?: { name?: string } }
        | undefined;
      const direction = entry.direction === "in" ? "<-" : "->";
      const method = message?.method ?? (entry.direction === "in" ? "response" : "response");
      const tool = message?.params?.name ? ` ${message.params.name}` : "";
      const id = message && "id" in message && message.id !== undefined ? ` #${String(message.id)}` : "";
      process.stderr.write(`[mcp-probe] ${direction} ${method}${tool}${id}\n`);
      return;
    }
    if (kind === "http_request") {
      process.stderr.write(`[mcp-probe] http ${String(entry.method)} ${String(entry.path)}\n`);
      return;
    }
    if (kind === "tool_result") {
      const tool = String(entry.tool);
      const duration = String(entry.durationMs);
      const error = entry.isError === true ? " isError=true" : "";
      process.stderr.write(`[mcp-probe] tool ${tool} done ${duration}ms${error}\n`);
      return;
    }
    if (kind === "tool_cancelled" || kind === "approve_visit" || kind === "session_open") {
      process.stderr.write(`[mcp-probe] ${String(kind)} ${JSON.stringify(entry)}\n`);
    }
  }
}
