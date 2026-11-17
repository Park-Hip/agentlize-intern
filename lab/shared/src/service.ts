import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readServiceKey } from './env.js';
import { sendJson } from './http.js';
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
  /**
   * Replaces the default `/health`-only handler. A service that sets this owns
   * every route, including `/health`, and decides how to authenticate them.
   */
  readonly handler?: RequestHandler;
}

export type RequestHandler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;

export interface RunningService {
  readonly service: ServiceName;
  readonly port: number;
  readonly url: string;
  close(): Promise<void>;
}

export function createHealthServer(service: ServiceName): Server {
  return createServer((req, res) => {
    const path = new URL(req.url ?? '/', `http://${LOOPBACK_HOST}`).pathname;

    if (path === '/health') {
      if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'method_not_allowed' }, { allow: 'GET' });
        return;
      }
      const body: HealthResponse = { status: 'ok', service };
      sendJson(res, 200, body);
      return;
    }

    sendJson(res, 404, { error: 'not_found' });
  });
}

function createHandlerServer(handler: RequestHandler): Server {
  return createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch((error: unknown) => {
      console.error(`request failed: ${error instanceof Error ? error.message : String(error)}`);
      if (!res.headersSent) {
        sendJson(res, 500, { error: 'internal_error' });
      } else {
        res.destroy();
      }
    });
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
  const server =
    options.handler === undefined ? createHealthServer(options.service) : createHandlerServer(options.handler);

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
