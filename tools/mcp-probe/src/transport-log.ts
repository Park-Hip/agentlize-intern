import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type { ProbeContext } from "./context.js";
import { redactHeaders } from "./log.js";

/** Keys that the MCP core defines. Anything else is new evidence and gets its own log line. */
const KNOWN_META_KEYS = new Set(["progressToken", "io.modelcontextprotocol/related-task"]);

type AnyMessage = JSONRPCMessage & {
  method?: string;
  params?: Record<string, unknown> & { _meta?: Record<string, unknown>; name?: string };
  id?: string | number;
};

/**
 * Wrap an already-connected transport so that:
 * - every incoming JSON-RPC message is logged before the protocol handles it;
 * - every outgoing JSON-RPC message is logged before it hits the wire;
 * - the initialize params and any non-standard _meta keys become their own log lines.
 *
 * Must run after server.connect(), because that call installs transport.onmessage.
 */
export function hookTransport(transport: Transport, ctx: ProbeContext): void {
  const originalOnMessage = transport.onmessage;
  const originalSend = transport.send.bind(transport);

  transport.onmessage = (message, extra) => {
    const typed = message as AnyMessage;
    const sessionId = transport.sessionId ?? ctx.sessionId ?? null;
    ctx.logger.write({
      kind: "jsonrpc",
      direction: "in",
      transport: ctx.transport,
      sessionId,
      message,
      requestInfo: extra?.requestInfo
        ? {
            url: extra.requestInfo.url?.toString() ?? null,
            headers: redactHeaders(extra.requestInfo.headers),
          }
        : null,
    });

    if (typed.method === "initialize") {
      ctx.initializeParams = typed.params ?? null;
      ctx.logger.write({
        kind: "session_init",
        transport: ctx.transport,
        sessionId,
        initializeParams: typed.params ?? null,
        clientInfo: (typed.params as { clientInfo?: unknown } | undefined)?.clientInfo ?? null,
        capabilities: (typed.params as { capabilities?: unknown } | undefined)?.capabilities ?? null,
        protocolVersion: (typed.params as { protocolVersion?: unknown } | undefined)?.protocolVersion ?? null,
      });
    }

    const meta = typed.params?._meta;
    if (meta && typeof meta === "object") {
      const unknownKeys = Object.keys(meta).filter((key) => !KNOWN_META_KEYS.has(key));
      if (unknownKeys.length > 0) {
        ctx.logger.write({
          kind: "extra_meta",
          transport: ctx.transport,
          sessionId,
          method: typed.method ?? null,
          unknownKeys,
          meta,
        });
      }
    }

    originalOnMessage?.(message, extra);
  };

  transport.send = async (message, options) => {
    ctx.logger.write({
      kind: "jsonrpc",
      direction: "out",
      transport: ctx.transport,
      sessionId: transport.sessionId ?? ctx.sessionId ?? null,
      relatedRequestId: options?.relatedRequestId ?? null,
      message,
    });
    return originalSend(message, options);
  };
}
