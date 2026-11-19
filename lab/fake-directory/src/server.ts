import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { z } from 'zod';
import {
  BodyError,
  DEPARTMENTS,
  EMPLOYEE_ID_PATTERN,
  LOOPBACK_HOST,
  hasValidServiceKey,
  ROLES,
  readJsonBody,
  readServiceKey,
  resolveDataDir,
  sendJson,
  startService,
  testHooksEnabled,
  type RunningService,
} from '@lab/shared';
import { DirectoryStore, serializeEmployee, type PatchInput, type StoredResponse } from './store.js';

export const DIRECTORY_FILE_NAME = 'directory.sqlite';

const LIST_PARAMS = new Set(['name', 'department']);
const EMPLOYEE_PATH = /^\/employees\/([^/]+)$/;
const KEY_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;

/** Field names a hook may add: lower case words joined by underscores. */
const FIELD_NAME = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/);

const FIELD_RULES: Readonly<Record<string, z.ZodType<string>>> = {
  full_name: z.string().trim().min(1).max(100),
  department: z.enum(DEPARTMENTS),
  role: z.enum(ROLES),
  work_email: z.email().regex(/@lab\.example$/),
};

const patchBody = z.strictObject({
  expected_version: z.number().int().min(1),
  changes: z.record(z.string(), z.string().max(500)).refine((changes) => Object.keys(changes).length > 0),
});

const addFieldBody = z.strictObject({
  field: FIELD_NAME.refine((name) => name !== 'employee_id' && name !== 'version'),
  value: z.string().max(500),
});

export interface DirectoryOptions {
  /** Explicit port, used by tests with 0. Defaults to `LAB_DIRECTORY_PORT`. */
  readonly port?: number;
  readonly env?: NodeJS.ProcessEnv;
  /** SQLite file. Defaults to `directory.sqlite` in the data folder. */
  readonly file?: string;
}

function fail(res: ServerResponse, status: number, error: string, extra: Record<string, unknown> = {}): void {
  sendJson(res, status, { error, ...extra });
}

/** Write a response kept from an earlier request, so a replay is byte-for-byte the first answer. */
function sendStored(res: ServerResponse, response: StoredResponse, headers: Record<string, string> = {}): void {
  res.writeHead(response.status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(response.body);
}

/** A malformed escape cannot name an employee, so it decodes to a code nobody has. */
function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return '';
  }
}

function methodNotAllowed(res: ServerResponse, allow: string): void {
  sendJson(res, 405, { error: 'method_not_allowed' }, { allow });
}

/**
 * Build the request handler. It does no permission checks beyond the service
 * key: whoever holds the key is the gateway, and the gateway decides who may
 * see or change what (spec section 4.2).
 */
export function createDirectoryHandler(options: {
  readonly store: DirectoryStore;
  readonly serviceKey: string;
  readonly testHooks: boolean;
}): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const { store, serviceKey, testHooks } = options;

  return async (req, res) => {
    // The key is checked first, for every path and method, so an unauthenticated
    // caller cannot tell a real route from a missing one.
    if (!hasValidServiceKey(req.headers.authorization, serviceKey)) {
      sendJson(res, 401, { error: 'unauthorized' }, { 'www-authenticate': 'Bearer' });
      return;
    }

    const url = new URL(req.url ?? '/', `http://${LOOPBACK_HOST}`);
    const path = url.pathname;
    const method = req.method ?? 'GET';

    if (path === '/health') {
      if (method !== 'GET') return methodNotAllowed(res, 'GET');
      sendJson(res, 200, { status: 'ok', service: 'directory' });
      return;
    }

    if (path === '/employees') {
      if (method !== 'GET') return methodNotAllowed(res, 'GET');
      for (const param of url.searchParams.keys()) {
        if (!LIST_PARAMS.has(param)) {
          return fail(res, 400, 'unsupported_filter', { allowed: [...LIST_PARAMS] });
        }
      }
      const employees = store.list({
        name: url.searchParams.get('name') ?? undefined,
        department: url.searchParams.get('department') ?? undefined,
      });
      sendJson(res, 200, { employees: employees.map(serializeEmployee) });
      return;
    }

    const employeeMatch = EMPLOYEE_PATH.exec(path);
    if (employeeMatch !== null) {
      const employeeId = safeDecode(employeeMatch[1] ?? '');
      if (method === 'GET') {
        const employee = store.get(employeeId);
        if (employee === undefined) return fail(res, 404, 'employee_not_found');
        sendJson(res, 200, serializeEmployee(employee));
        return;
      }
      if (method === 'PATCH') return patchEmployee(store, employeeId, req, res);
      return methodNotAllowed(res, 'GET, PATCH');
    }

    if (path === '/admin/reset' || path === '/admin/add-field') {
      if (!testHooks) return fail(res, 404, 'not_found');
      if (method !== 'POST') return methodNotAllowed(res, 'POST');

      if (path === '/admin/reset') {
        store.reset();
        sendJson(res, 200, { status: 'reset' });
        return;
      }
      return addField(store, req, res);
    }

    if (path === '/admin/write-count') {
      if (!testHooks) return fail(res, 404, 'not_found');
      if (method !== 'GET') return methodNotAllowed(res, 'GET');
      const employee = url.searchParams.get('employee');
      if (employee === null || !EMPLOYEE_ID_PATTERN.test(employee)) {
        return fail(res, 400, 'invalid_query', { allowed: ['employee'] });
      }
      sendJson(res, 200, { employee, count: store.writeCount(employee) });
      return;
    }

    fail(res, 404, 'not_found');
  };
}

async function parseBody<S extends z.ZodType>(
  req: IncomingMessage,
  res: ServerResponse,
  schema: S,
): Promise<z.infer<S> | undefined> {
  try {
    const parsed = schema.safeParse(await readJsonBody(req));
    if (parsed.success) return parsed.data;
    fail(res, 400, 'invalid_body', { issues: parsed.error.issues.map((issue) => issue.path.join('.') || '(body)') });
  } catch (error) {
    if (error instanceof BodyError) {
      fail(res, error.status, error.code);
    } else {
      throw error;
    }
  }
  return undefined;
}

async function patchEmployee(
  store: DirectoryStore,
  employeeId: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const key = req.headers['idempotency-key'];
  if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
    return fail(res, 400, 'invalid_idempotency_key', { header: 'Idempotency-Key' });
  }

  const body = await parseBody(req, res, patchBody);
  if (body === undefined) return;

  for (const [field, value] of Object.entries(body.changes)) {
    const rule = FIELD_RULES[field];
    if (rule !== undefined && !rule.safeParse(value).success) {
      return fail(res, 400, 'invalid_value', { field });
    }
  }

  const input: PatchInput = {
    employeeId,
    idempotencyKey: key,
    expectedVersion: body.expected_version,
    changes: body.changes,
  };
  const result = store.patch(input);
  switch (result.kind) {
    case 'replayed':
      sendStored(res, result.response, { 'idempotent-replayed': 'true' });
      return;
    case 'key_reused':
      return fail(res, 422, 'idempotency_key_reused');
    case 'conflict':
      return fail(res, 409, 'version_conflict', { current_version: result.currentVersion });
    case 'unknown_field':
      return fail(res, 400, 'unknown_field', { field: result.field });
    case 'not_found':
      return fail(res, 404, 'employee_not_found');
    case 'written':
      sendStored(res, result.response);
      return;
  }
}

async function addField(store: DirectoryStore, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await parseBody(req, res, addFieldBody);
  if (body === undefined) return;

  const result = store.addField(body.field, body.value);
  if (result.kind === 'exists') return fail(res, 409, 'field_exists', { field: body.field });
  sendJson(res, 200, { status: 'added', field: body.field, employees: result.count });
}

export interface RunningDirectory extends RunningService {
  readonly store: DirectoryStore;
}

/** Open the SQLite file, then listen. The service key is required before either happens. */
export async function startDirectory(options: DirectoryOptions = {}): Promise<RunningDirectory> {
  const env = options.env ?? process.env;
  const serviceKey = readServiceKey(env);
  const store = new DirectoryStore(options.file ?? join(resolveDataDir(env), DIRECTORY_FILE_NAME));

  try {
    const running = await startService({
      service: 'directory',
      env,
      ...(options.port === undefined ? {} : { port: options.port }),
      handler: createDirectoryHandler({ store, serviceKey, testHooks: testHooksEnabled(env) }),
    });

    return {
      ...running,
      store,
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
