/**
 * One tool as the model sees it. The parameter schema is JSON Schema, the
 * shape every model API accepts, so a door can hand over what the gateway
 * publishes without translating it again.
 */
export interface ToolSpec {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
}

/** What one tool call returns. `durationMs` is the door's own measurement of the call. */
export interface ToolCallResult {
  readonly text: string;
  readonly reasonCode: string | null;
  readonly traceId: string | null;
  readonly isError: boolean;
  readonly durationMs: number;
}

/** One call the loop asks a door to make. `turnId` goes out as `X-Lab-Turn`. */
export interface ToolCallInput {
  readonly name: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly turnId: string;
}

/**
 * The one seam assistant A and assistant B implement (issues #108, #109).
 * `listTools` gives the model the catalog; `callTool` runs one call and must
 * attach the turn code to the gateway request as `X-Lab-Turn`.
 */
export interface ToolDoor {
  readonly name: string;
  listTools(): Promise<readonly ToolSpec[]>;
  callTool(input: ToolCallInput): Promise<ToolCallResult>;
}

/** What the command gives a door factory: where the gateway is and whose key to use. */
export interface DoorContext {
  readonly baseUrl: string;
  readonly employeeId: string;
  readonly toolKey: string;
}

/** What `src/mcp/door.ts` and `src/function-calling/door.ts` must export. */
export type DoorFactory = (context: DoorContext) => ToolDoor | Promise<ToolDoor>;
