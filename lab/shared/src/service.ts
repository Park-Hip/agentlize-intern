import { createServer, type Server, type ServerResponse } from 'node:http';
import { readServiceKey } from './env.js';
import { LOOPBACK_HOST, resolvePort, type ServiceName } from './ports.js';

export interface HealthResponse {
  readonly status: 'ok';
  readonly service: ServiceName;
}

export interface StartServiceOptions {
  readonly service: ServiceName;
  /** Explicit port, used by tests with 0. Defaults to the port environment variable. */
  readonly port?: number;
  readonly env?: NodeJS.ProcessEnv;
}

export interface RunningService {
  readonly service: ServiceName;
  readonly port: number;
  readonly url: string;
  close(): Promise<void>;
}

function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(`${JSON.stringify(body)}\n`);
}

export function createHealthServer(service: ServiceName): Server {
  return createServer((req, res) => {
    const path = new URL(req.url ?? '/', `http://${LOOPBACK_HOST}`).pathname;

    if (path === '/health') {
      if (req.method !== 'GET') {
        json(res, 405, { error: 'method_not_allowed' }, { allow: 'GET' });
        return;
      }
      const body: HealthResponse = { status: 'ok', service };
      json(res, 200, body);
      return;
    }

    json(res, 404, { error: 'not_found' });
  });
}

/**
 * Start one service on loopback. The service key is required here, before the
 * socket opens, so a misconfigured process cannot answer requests at all.
 */
export async function startService(options: StartServiceOptions): Promise<RunningService> {
  const env = options.env ?? process.env;
  readServiceKey(env);

  const port = options.port ?? resolvePort(options.service, env);
  const server = createHealthServer(options.service);

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, LOOPBACK_HOST);
  });

  const address = server.address();
  if (address === null || typeof address !== 'object') {
    server.close();
    throw new Error(`${options.service} did not report a listening address`);
  }

  const actualPort = address.port;
  let closed = false;

  return {
    service: options.service,
    port: actualPort,
    url: `http://${LOOPBACK_HOST}:${actualPort}`,
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      server.closeIdleConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      });
    },
  };
}
