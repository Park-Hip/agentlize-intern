import type { KeyStore } from '../identity/key-store.js';
import { KeyAuthorizationResolver } from './key-resolver.js';
import { AuthorizationRegistry } from './registry.js';

/** The registry the gateway starts with: the legacy key resolver, and nothing behind a token. */
export function createAuthorizationRegistry(keys: KeyStore): AuthorizationRegistry {
  const registry = new AuthorizationRegistry();
  registry.register(new KeyAuthorizationResolver(keys));
  return registry;
}

export * from './key-resolver.js';
export * from './refusal.js';
export * from './registry.js';
export * from './types.js';
