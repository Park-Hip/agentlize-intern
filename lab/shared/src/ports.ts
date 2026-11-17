/** The three processes the lab runs. The MCP adapter is a client, not a service. */
export const SERVICES = ['gateway', 'directory', 'tasks'] as const;

export type ServiceName = (typeof SERVICES)[number];

/** Fixed ports from ADR-0003. Tests override them through the environment. */
export const DEFAULT_PORTS: Readonly<Record<ServiceName, number>> = {
  gateway: 8790,
  directory: 8791,
  tasks: 8792,
};

export const PORT_ENV: Readonly<Record<ServiceName, string>> = {
  gateway: 'LAB_GATEWAY_PORT',
  directory: 'LAB_DIRECTORY_PORT',
  tasks: 'LAB_TASKS_PORT',
};

/**
 * Every service binds to loopback only. ADR-0003 keeps the lab off the network
 * until a separate decision chooses where it runs.
 */
export const LOOPBACK_HOST = '127.0.0.1' as const;

export function resolvePort(service: ServiceName, env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[PORT_ENV[service]];
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_PORTS[service];
  }

  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${PORT_ENV[service]} must be an integer between 1 and 65535, got "${raw}"`);
  }
  return port;
}
