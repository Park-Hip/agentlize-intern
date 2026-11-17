#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { parseCli, sanitizedConfig, USAGE } from "./args.js";
import type { ProbeContext } from "./context.js";
import { startHttpProbe, type HttpProbeHandle } from "./http.js";
import { ProbeLogger } from "./log.js";
import { createProbeServer, PROBE_VERSION, TOOL_NAMES } from "./server.js";
import { hookTransport } from "./transport-log.js";

async function main(): Promise<void> {
  let options;
  try {
    options = parseCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`[mcp-probe] ${String(error)}\n\n${USAGE}`);
    process.exit(2);
  }

  if (options.help) {
    process.stdout.write(USAGE);
    return;
  }

  const startedAt = Date.now();
  const logger = new ProbeLogger({
    transport: options.transport,
    logDir: options.logDir,
    config: sanitizedConfig(options),
  });

  const fail = (kind: string, error: unknown): void => {
    logger.write({ kind, error: String(error), stack: error instanceof Error ? error.stack : null });
    process.stderr.write(`[mcp-probe] ${kind}: ${String(error)}\n`);
    process.exit(1);
  };
  process.on("uncaughtException", (error) => fail("uncaught_exception", error));
  process.on("unhandledRejection", (error) => fail("unhandled_rejection", error));

  let closing = false;
  const closeAndExit = async (signal: string, handle?: HttpProbeHandle, closeStdio?: () => Promise<void>): Promise<void> => {
    if (closing) return;
    closing = true;
    logger.write({ kind: "server_stop", reason: signal, uptimeSeconds: Math.round((Date.now() - startedAt) / 1000) });
    const force = setTimeout(() => process.exit(0), 2500);
    force.unref();
    try {
      if (handle) await handle.close();
      if (closeStdio) await closeStdio();
    } catch (error) {
      logger.write({ kind: "server_stop_error", error: String(error) });
    }
    process.exit(0);
  };

  if (options.transport === "stdio") {
    const ctx: ProbeContext = {
      transport: "stdio",
      logger,
      publicBaseUrl: (options.publicUrl ?? "http://localhost:8787").replace(/\/+$/, ""),
      bearerRequired: false,
      startedAt,
    };
    const server = createProbeServer(ctx);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    hookTransport(transport, ctx);
    logger.write({
      kind: "server_ready",
      transport: "stdio",
      version: PROBE_VERSION,
      tools: TOOL_NAMES,
      note: "Host giao tiếp qua stdin/stdout. Chẩn đoán chỉ ghi ra stderr.",
    });
    const shutdown = (signal: string) => {
      void closeAndExit(signal, undefined, async () => {
        await server.close();
        await transport.close();
      });
    };
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    return;
  }

  const handle = await startHttpProbe({
    host: options.host,
    port: options.port,
    bearer: options.bearer,
    publicUrl: options.publicUrl,
    tlsCert: options.tlsCert,
    tlsKey: options.tlsKey,
    logger,
    startedAt,
  });
  logger.write({
    kind: "server_ready",
    transport: "http",
    version: PROBE_VERSION,
    tools: TOOL_NAMES,
    endpoint: `${handle.publicBaseUrl}/mcp`,
  });
  const shutdown = (signal: string) => void closeAndExit(signal, handle);
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error) => {
  process.stderr.write(`[mcp-probe] fatal: ${String(error)}\n`);
  process.exit(1);
});
