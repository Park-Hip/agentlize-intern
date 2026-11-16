import { parseArgs } from "node:util";

export type TransportName = "stdio" | "http";

export interface CliOptions {
  transport: TransportName;
  host: string;
  port: number;
  bearer?: string;
  logDir?: string;
  publicUrl?: string;
  tlsCert?: string;
  tlsKey?: string;
  help: boolean;
}

export const USAGE = `mcp-probe - MCP host probe for Tho Than (simulated data only)

Usage:
  node dist/index.js --stdio [options]
  node dist/index.js --http --port 8787 [options]

Transports (pick exactly one):
  --stdio                 Speak MCP over stdin/stdout. The host spawns this process.
  --http                  Serve Streamable HTTP. Default endpoint: http://localhost:8787/mcp

Options:
  --port <n>              HTTP port, default 8787.
  --host <addr>           HTTP bind address, default 127.0.0.1. Use 0.0.0.0 for a tunnel.
  --bearer <token>        HTTP mode only: require "Authorization: Bearer <token>".
                          Without this flag every Authorization header is accepted and logged.
  --public-url <url>      Base URL used by echo_link, default http(s)://<host>:<port>.
                          Set this when the host reaches the probe through a tunnel.
  --log-dir <dir>         Log directory, default <repo>/scratch/mcp-probe.
  --tls-cert <file>       Serve HTTPS. Requires --tls-key.
  --tls-key <file>        Serve HTTPS. Requires --tls-cert.
  -h, --help              Print this help.

The log file path is printed on stderr at startup and written as the first JSON line.
Every HTTP request and every JSON-RPC message is appended as one JSON line.
`;

export function parseCli(argv: string[]): CliOptions {
  const { values } = parseArgs({
    args: argv,
    allowPositionals: false,
    strict: true,
    options: {
      stdio: { type: "boolean", default: false },
      http: { type: "boolean", default: false },
      port: { type: "string" },
      host: { type: "string" },
      bearer: { type: "string" },
      "log-dir": { type: "string" },
      "public-url": { type: "string" },
      "tls-cert": { type: "string" },
      "tls-key": { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (values.help) {
    return { transport: "stdio", host: "127.0.0.1", port: 8787, help: true };
  }
  if (values.stdio === values.http) {
    throw new Error("Pick exactly one transport: --stdio or --http.");
  }
  if (values["tls-cert"] && !values["tls-key"]) throw new Error("--tls-cert requires --tls-key.");
  if (values["tls-key"] && !values["tls-cert"]) throw new Error("--tls-key requires --tls-cert.");
  if (values.stdio && (values.port || values.host || values.bearer || values["tls-cert"])) {
    throw new Error("--port, --host, --bearer and TLS flags only apply to --http.");
  }

  const transport: TransportName = values.stdio ? "stdio" : "http";
  const port = values.port === undefined ? 8787 : Number(values.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`--port must be an integer between 1 and 65535, got "${String(values.port)}".`);
  }
  const host = values.host ?? "127.0.0.1";
  if (!host.trim()) throw new Error("--host must not be empty.");

  const options: CliOptions = {
    transport,
    host,
    port,
    help: false,
  };
  if (values.bearer !== undefined) {
    if (!values.bearer) throw new Error("--bearer must not be empty.");
    options.bearer = values.bearer;
  }
  if (values["log-dir"] !== undefined) {
    if (!values["log-dir"].trim()) throw new Error("--log-dir must not be empty.");
    options.logDir = values["log-dir"];
  }
  if (values["public-url"] !== undefined) {
    const publicUrl = values["public-url"].trim().replace(/\/+$/, "");
    if (!/^https?:\/\/[^\s]+$/.test(publicUrl)) {
      throw new Error("--public-url must start with http:// or https:// and contain no spaces.");
    }
    options.publicUrl = publicUrl;
  }
  if (values["tls-cert"] !== undefined) options.tlsCert = values["tls-cert"];
  if (values["tls-key"] !== undefined) options.tlsKey = values["tls-key"];
  return options;
}

/** The config that lands in server_start. Never include the bearer value itself. */
export function sanitizedConfig(options: CliOptions): Record<string, unknown> {
  return {
    transport: options.transport,
    host: options.transport === "http" ? options.host : undefined,
    port: options.transport === "http" ? options.port : undefined,
    bearerRequired: Boolean(options.bearer),
    bearerLength: options.bearer ? options.bearer.length : 0,
    publicUrl: options.publicUrl ?? null,
    tls: Boolean(options.tlsCert),
  };
}
