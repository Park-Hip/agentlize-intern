import type { IncomingMessage, ServerResponse } from 'node:http';
import { performance } from 'node:perf_hooks';
import { BodyError, readJsonBody, refusalMessage, sendJson } from '@lab/shared';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { MCP_DOOR } from './authorization/index.js';
import {
  catalogEntries,
  maskedHostUser,
  performCall,
  TraceUnavailableError,
  UNKNOWN_TOOL,
  type GatewayDeps,
} from './call.js';
import type { Identity, IdentityResult } from './identity/index.js';
import { OAUTH_SCOPE_PROPOSE, OAUTH_SCOPE_READ } from './oauth/discovery.js';
import { newTraceId, readTurnId } from './trace/index.js';

const SERVER_INFO = { name: 'agentlize-lab-gateway', version: '0.0.0' } as const;

/** JSON-RPC codes the MCP transport itself uses for a request that never reached a method. */
const PARSE_ERROR = -32700;
const REQUEST_REFUSED = -32001;
const INTERNAL_ERROR = -32603;
const METHOD_NOT_ALLOWED = -32000;

const TRACE_UNAVAILABLE_SENTENCE = 'Cổng không ghi được vết nên không trả kết quả. Hãy báo người vận hành Lab.';

function rpcError(
  res: ServerResponse,
  status: number,
  code: number,
  message: string,
  headers: Record<string, string> = {},
  data?: { reason_code: string | null; deny_reason: string | null },
): void {
  sendJson(res, status, { jsonrpc: '2.0', error: { code, message, ...(data === undefined ? {} : { data }) }, id: null }, headers);
}

/**
 * The `WWW-Authenticate` a `/mcp` refusal carries. When the gateway publishes
 * OAuth, the challenge names the resource metadata document so a client can
 * discover where to get a token; an error and a scope join it for a refusal.
 */
function bearerChallenge(deps: GatewayDeps, extra: Readonly<Record<string, string>> = {}): string {
  const parts = ['Bearer realm="lab-gateway"'];
  const metadata = deps.oauth?.()?.resourceMetadataUrl;
  if (metadata !== undefined) parts.push(`resource_metadata="${metadata}"`);
  for (const [name, value] of Object.entries(extra)) parts.push(`${name}="${value}"`);
  return parts.join(', ');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Every `tools/call` in the body, whether it is one message or a batch. */
function toolCallsIn(body: unknown): { readonly name: string }[] {
  const messages = Array.isArray(body) ? body : [body];
  const calls: { readonly name: string }[] = [];
  for (const message of messages) {
    if (!isRecord(message) || message['method'] !== 'tools/call') continue;
    const params = message['params'];
    if (!isRecord(params) || typeof params['name'] !== 'string') continue;
    calls.push({ name: params['name'] });
  }
  return calls;
}

/** The scopes an OAuth token must hold for these calls: reading for every tool, proposing for a write. */
function requiredScopes(deps: GatewayDeps, body: unknown): readonly string[] | undefined {
  const calls = toolCallsIn(body);
  if (calls.length === 0) return undefined;
  const required = new Set<string>([OAUTH_SCOPE_READ]);
  for (const call of calls) {
    const tool = deps.tools.find((candidate) => candidate.name === call.name);
    if (tool?.kind === 'propose') required.add(OAUTH_SCOPE_PROPOSE);
  }
  return [...required];
}

/** Write one trace line for a scope refusal, because a refused call still happened. */
function traceScopeRefusal(
  deps: GatewayDeps,
  req: IncomingMessage,
  identity: Identity,
  tool: string,
  startedAt: number,
): void {
  deps.trace.append({
    traceId: newTraceId(),
    requester: identity.employeeId,
    caller: identity.caller,
    entry: 'mcp',
    tool,
    objectId: null,
    outcome: 'refused',
    reasonCode: 'NOT_PERMITTED',
    outOfScope: false,
    ruleId: 'MCP.INSUFFICIENT_SCOPE',
    policyVersion: null,
    hostUser: maskedHostUser(req.headers),
    turnId: readTurnId(req.headers),
    proposalId: null,
    droppedFields: 0,
    durationMs: performance.now() - startedAt,
  });
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
        _meta: {
          reason_code: result.reasonCode,
          deny_reason: result.denyReason ?? null,
          gateway_status: result.gatewayStatus ?? null,
          untrusted_content: result.untrustedContent ?? false,
          truncated: result.truncated ?? false,
          trace_id: traceId,
        },
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

  // A bad source stops the whole request, so a host sees the failure when it
  // connects, not on its first tool call. This door accepts a legacy `lab_` key
  // and a Lab-issued OAuth token; a token is never retried as a key.
  const authenticated = await deps.identity.authenticate(req.headers, MCP_DOOR);
  if (!authenticated.ok) {
    try {
      const { result } = await performCall(deps, 'mcp', req.headers, authenticated, UNKNOWN_TOOL, () =>
        Promise.resolve({}),
      );
      return rpcError(res, result.status, REQUEST_REFUSED, result.text, {
        'www-authenticate': bearerChallenge(deps),
      }, {
        reason_code: result.reasonCode,
        deny_reason: result.denyReason ?? null,
      });
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

  // An OAuth token carries its scopes; a tool the token was not granted is a
  // 403 with `insufficient_scope`, before any system is read.
  const required = requiredScopes(deps, body);
  const granted = authenticated.identity.oauthScopes;
  if (required !== undefined && granted !== undefined) {
    const missing = required.filter((scope) => !granted.includes(scope));
    if (missing.length > 0) {
      const started = performance.now();
      try {
        traceScopeRefusal(
          deps,
          req,
          authenticated.identity,
          toolCallsIn(body)[0]?.name ?? UNKNOWN_TOOL,
          started,
        );
      } catch {
        return rpcError(res, 500, INTERNAL_ERROR, TRACE_UNAVAILABLE_SENTENCE);
      }
      const sentence = refusalMessage(
        'NOT_PERMITTED',
        `Thẻ truy cập này không có phạm vi ${required.join(' ')} nên cổng không gọi công cụ này. Hãy xin quyền lại.`,
      );
      return rpcError(res, 403, REQUEST_REFUSED, sentence, {
        'www-authenticate': bearerChallenge(deps, {
          error: 'insufficient_scope',
          scope: required.join(' '),
        }),
      }, {
        reason_code: 'NOT_PERMITTED',
        deny_reason: 'no_permission',
      });
    }
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
