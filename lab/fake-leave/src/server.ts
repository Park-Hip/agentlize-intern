import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { z } from 'zod';
import {
  BodyError,
  DEPARTMENTS,
  EMPLOYEE_ID_PATTERN,
  LOOPBACK_HOST,
  PERSONAS,
  hasValidServiceKey,
  readJsonBody,
  readServiceKey,
  resolveDataDir,
  sendJson,
  startService,
  testHooksEnabled,
  type Department,
  type RunningService,
} from '@lab/shared';
import { resolveLeaveConfig, type LeaveConfig } from './config.js';
import { LeaveStore, type CreateLeaveInput, type StoredResponse } from './store.js';
import { LEAVE_STATUSES, LEAVE_TYPES, type LeaveStatus } from './types.js';

export const LEAVE_FILE_NAME = 'leave.sqlite';

const KEY_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;
const LEAVE_CODE = /^NP-[1-9][0-9]*$/;
const LIST_PARAMS = new Set(['employee', 'date', 'status']);
const MAX_REASON = 500;
const MAX_NOTE = 1_000;

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must look like YYYY-MM-DD')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'date is not a real calendar day');

const createBodySchema = z
  .strictObject({
    employee: z.string().regex(EMPLOYEE_ID_PATTERN),
    department: z.enum(DEPARTMENTS).optional(),
    leave_type: z.enum(LEAVE_TYPES),
    from_date: dateSchema,
    to_date: dateSchema,
    reason: z.string().trim().min(1).max(MAX_REASON),
    note: z.string().trim().max(MAX_NOTE).optional(),
  })
  .refine((body) => body.to_date >= body.from_date, {
    message: 'to_date must not be before from_date',
    path: ['to_date'],
  });

export interface LeaveServerOptions {
  readonly env?: NodeJS.ProcessEnv;
  /** Explicit port, used by tests with 0. Defaults to `LAB_LEAVE_PORT`. */
  readonly port?: number;
  /** Explicit SQLite path. Defaults to `<data dir>/leave.sqlite`. */
  readonly dbPath?: string;
  /** Explicit profile, used by tests that must not read the caller's environment. */
  readonly config?: LeaveConfig;
}

export interface RunningLeaveServer extends RunningService {
  readonly store: LeaveStore;
  readonly config: LeaveConfig;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail?: string,
    readonly headers: Readonly<Record<string, string>> = {},
  ) {
    super(code);
  }
}

function departmentOf(employee: string): Department {
  const persona = Object.values(PERSONAS).find((candidate) => candidate.employeeId === employee);
  return persona?.department ?? 'Vận hành';
}

function sendStored(res: ServerResponse, response: StoredResponse, headers: Readonly<Record<string, string>> = {}): void {
  res.writeHead(response.status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(response.body);
}

function methodNotAllowed(res: ServerResponse, allow: string): void {
  sendJson(res, 405, { error: 'method_not_allowed' }, { allow });
}

async function parseBody<S extends z.ZodType>(req: IncomingMessage, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await readJsonBody(req);
  } catch (error) {
    if (error instanceof BodyError) throw new HttpError(error.status, error.code);
    throw error;
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new HttpError(400, 'invalid_body', parsed.error.issues.map((issue) => issue.path.join('.') || '(body)').join(', '));
  }
  return parsed.data;
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return '';
  }
}

function isLeaveStatus(value: string): value is LeaveStatus {
  return (LEAVE_STATUSES as readonly string[]).includes(value);
}

/**
 * Build the request handler. It does no permission checks beyond the service
 * key: whoever holds the key is the gateway, and the gateway decides who may
 * see or create what (spec section 4.2).
 */
export function createLeaveHandler(options: {
  readonly store: LeaveStore;
  readonly serviceKey: string;
  readonly testHooks: boolean;
}): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const { store, serviceKey, testHooks } = options;

  const route = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (!hasValidServiceKey(req.headers.authorization, serviceKey)) {
      sendJson(res, 401, { error: 'unauthorized' }, { 'www-authenticate': 'Bearer' });
      return;
    }

    const url = new URL(req.url ?? '/', `http://${LOOPBACK_HOST}`);
    const path = url.pathname;
    const method = req.method ?? 'GET';

    if (path === '/health') {
      if (method !== 'GET') return methodNotAllowed(res, 'GET');
      sendJson(res, 200, { status: 'ok', service: 'leave' });
      return;
    }

    if (path === '/leave-requests') {
      if (method === 'GET') {
        for (const param of url.searchParams.keys()) {
          if (!LIST_PARAMS.has(param)) {
            throw new HttpError(400, 'unsupported_filter', `allowed filters: ${[...LIST_PARAMS].join(', ')}`);
          }
        }
        const employee = url.searchParams.get('employee') ?? undefined;
        if (employee !== undefined && !EMPLOYEE_ID_PATTERN.test(employee)) {
          throw new HttpError(400, 'invalid_filter', 'employee must look like NV-04');
        }
        const date = url.searchParams.get('date') ?? undefined;
        if (date !== undefined && !dateSchema.safeParse(date).success) {
          throw new HttpError(400, 'invalid_filter', 'date must look like YYYY-MM-DD');
        }
        const status = url.searchParams.get('status') ?? undefined;
        if (status !== undefined && !isLeaveStatus(status)) {
          throw new HttpError(400, 'invalid_filter', `status must be one of ${LEAVE_STATUSES.join(', ')}`);
        }
        sendJson(res, 200, {
          requests: store.list({
            ...(employee === undefined ? {} : { employee }),
            ...(date === undefined ? {} : { date }),
            ...(status === undefined ? {} : { status }),
          }),
        });
        return;
      }
      if (method === 'POST') return createRequest(store, req, res);
      return methodNotAllowed(res, 'GET, POST');
    }

    const codeMatch = /^\/leave-requests\/([^/]+)$/.exec(path);
    if (codeMatch !== null) {
      if (method !== 'GET') return methodNotAllowed(res, 'GET');
      const code = safeDecode(codeMatch[1] ?? '');
      const request = LEAVE_CODE.test(code) ? store.get(code) : undefined;
      if (request === undefined) throw new HttpError(404, 'leave_request_not_found');
      sendJson(res, 200, request);
      return;
    }

    if (path === '/admin/reset' || path === '/admin/created-count') {
      if (!testHooks) throw new HttpError(404, 'not_found');
      if (path === '/admin/reset') {
        if (method !== 'POST') return methodNotAllowed(res, 'POST');
        store.reset();
        sendJson(res, 200, { status: 'reset' });
        return;
      }
      if (method !== 'GET') return methodNotAllowed(res, 'GET');
      sendJson(res, 200, { count: store.createdCount() });
      return;
    }

    throw new HttpError(404, 'not_found');
  };

  return async (req, res) => {
    try {
      await route(req, res);
    } catch (error) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      if (error instanceof HttpError) {
        const body =
          error.detail === undefined ? { error: error.code } : { error: error.code, detail: error.detail };
        sendJson(res, error.status, body, error.headers);
        return;
      }
      if (error instanceof BodyError) {
        sendJson(res, error.status, { error: error.code });
        return;
      }
      console.error(`[fake-leave] request failed: ${error instanceof Error ? error.message : String(error)}`);
      sendJson(res, 500, { error: 'internal_error' });
    }
  };
}

async function createRequest(store: LeaveStore, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const key = req.headers['idempotency-key'];
  if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
    throw new HttpError(400, 'invalid_idempotency_key', 'Idempotency-Key header is required');
  }
  const body = await parseBody(req, createBodySchema);
  const input: CreateLeaveInput = {
    employee: body.employee,
    department: body.department ?? departmentOf(body.employee),
    leave_type: body.leave_type,
    from_date: body.from_date,
    to_date: body.to_date,
    reason: body.reason,
    note: body.note ?? '',
    requestKey: key,
    now: Date.now(),
  };
  const outcome = store.create(input);
  switch (outcome.kind) {
    case 'replayed':
      sendStored(res, outcome.response, { 'idempotent-replayed': 'true' });
      return;
    case 'key_reused':
      throw new HttpError(422, 'idempotency_key_reused', 'This key was used with different content');
    case 'written':
      sendStored(res, outcome.response);
      return;
  }
}

/** Open the SQLite file, then listen. The service key is required before either happens. */
export async function startLeaveServer(options: LeaveServerOptions = {}): Promise<RunningLeaveServer> {
  const env = options.env ?? process.env;
  const serviceKey = readServiceKey(env);
  const config = options.config ?? resolveLeaveConfig(env);
  const store = new LeaveStore(options.dbPath ?? join(resolveDataDir(env), LEAVE_FILE_NAME), config);

  try {
    const running = await startService({
      service: 'leave',
      env,
      ...(options.port === undefined ? {} : { port: options.port }),
      handler: createLeaveHandler({ store, serviceKey, testHooks: testHooksEnabled(env) }),
    });

    return {
      ...running,
      store,
      config,
      async close(): Promise<void> {
        try {
          await running.close();
        } finally {
          store.close();
        }
      },
    };
  } catch (error) {
    store.close();
    throw error;
  }
}
