/**
 * Placeholder for the stdio adapter described in spec section 4.2.
 * The transport, the tool catalog fetch and the call forwarding arrive with
 * milestone 1; this package keeps the workspace boundary and the environment
 * contract in one place until then.
 */
export const ADAPTER_ENV = {
  gatewayUrl: 'LAB_GATEWAY_URL',
  userKey: 'LAB_USER_KEY',
} as const;

export interface AdapterConfig {
  readonly gatewayUrl: string;
  readonly userKey: string;
}
