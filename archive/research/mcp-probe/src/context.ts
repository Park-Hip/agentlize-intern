import type { ProbeLogger } from "./log.js";

export type TransportName = "stdio" | "http";

/** Per-connection state: one object for stdio, one per Streamable HTTP session. */
export interface ProbeContext {
  transport: TransportName;
  logger: ProbeLogger;
  publicBaseUrl: string;
  bearerRequired: boolean;
  startedAt: number;
  /** Raw params of the initialize request, as the host sent them. */
  initializeParams?: unknown;
  /** Streamable HTTP session id, set once the transport initializes. */
  sessionId?: string;
  /** Last HTTP request seen for this session, used by whoami. */
  lastHttp?: {
    method: string;
    path: string;
    remoteAddress?: string;
    headers: Record<string, string | string[] | number | undefined>;
  };
}
