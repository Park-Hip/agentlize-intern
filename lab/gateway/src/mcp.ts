import type { IncomingMessage, ServerResponse } from 'node:http';
import { BodyError, readJsonBody, sendJson } from '@lab/shared';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import {
  catalogEntries,
  performCall,
  TraceUnavailableError,
  UNKNOWN_TOOL,
  type GatewayDeps,
} from './call.js';
import type { IdentityResult } from './identity/index.js';

const SERVER_INFO = { name: 'agentlize-lab-gateway', version: '0.0.0' } as const;

/** JSON-RPC codes the MCP transport itself uses for a request that never reached a method. */
const PARSE_ERROR = -32700;
const REQUEST_REFUSED = -32001;
const INTERNAL_ERROR = -32603;
const METHOD_NOT_ALLOWED = -32000;

const TRACE_UNAVAILABLE_SENTENCE = 'Cổng không ghi được vết nên không trả kết quả. Hãy báo người vận hành Lab.';

function rpcError(res: ServerResponse, status: number, code: number, message: string, headers: Record<string, string> = {}): void {
  sendJson(res, status, { jsonrpc: '2.0', error: { code, message }, id: null }, headers);
}

/** The same entries as `GET /v1/tools`, with the key MCP expects for the parameter schema. */
function mcpCatalog(deps: GatewayDeps): Tool[] {
  return catalogEntries(deps.tools).map((entry) => ({
    name: entry.name,
    description: entry.description,
    inputSchema: entry.input_schema as Tool['inputSchema'],
  }));
}

/**
 * One MCP server for one request. Nothing outlives the request: the key is
 * checked before this is built, every `tools/call` is checked again from the
 * key's person, and every line of state is in the gateway's tables (ADR-0004).
 */
function buildServer(
  deps: GatewayDeps,
  req: IncomingMessage,
  authenticated: IdentityResult,
  tools: Tool[],
): Server {
  const server = new Server(SERVER_INFO, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const { name, arguments: args } = request.params;
    try {
      const { result, traceId } = await performCall(deps, 'mcp', req.headers, authenticated, name, () =>
        Promise.resolve(args ?? {}),
      );
      return {
        content: [{ type: 'text', text: result.text }],
        // A refusal or a failure is an error to the host; "not found" is an answer.
        isError: result.outcome === 'refused' || result.outcome === 'error',
        _meta: { reason_code: result.reasonCode, trace_id: traceId },
      };
    } catch (error) {
      if (!(error instanceof TraceUnavailableError)) throw error;
      return { content: [{ type: 'text', text: TRACE_UNAVAILABLE_SENTENCE }], isError: true };
    }
  });
  return server;
}

/**
 * `/mcp`: Streamable HTTP, one request one answer, no session kept.
 * The transport is built without a session id generator, so a host's
 * `mcp-session-id` is accepted and ignored. Only POST carries a call; GET would
 * open a stream the gateway has nothing to send on, and DELETE ends a session
 * that does not exist.
 */
export async function handleMcp(deps: GatewayDeps, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    return rpcError(res, 405, METHOD_NOT_ALLOWED, 'Method not allowed. Gửi POST.', { allow: 'POST' });
  }

  // A bad key stops the whole request, so a host sees the failure when it connects, not on its first tool call.
  const authenticated = await deps.identity.authenticate(req.headers);
  if (!authenticated.ok) {
    try {
      const { result } = await performCall(deps, 'mcp', req.headers, authenticated, UNKNOWN_TOOL, () =>
        Promise.resolve({}),
      );
      return rpcError(res, result.status, REQUEST_REFUSED, result.text, { 'www-authenticate': 'Bearer realm="lab-gateway"' });
    } catch (error) {
      if (!(error instanceof TraceUnavailableError)) throw error;
      return rpcError(res, 500, INTERNAL_ERROR, TRACE_UNAVAILABLE_SENTENCE);
    }
  }

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    if (!(error instanceof BodyError)) throw error;
    const message = error.code === 'body_too_large' ? 'Nội dung gửi lên quá lớn.' : 'Nội dung gửi lên phải là JSON.';
    return rpcError(res, error.status, PARSE_ERROR, message);
  }

  const server = buildServer(deps, req, authenticated, mcpCatalog(deps));
  const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
  res.once('close', () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}
