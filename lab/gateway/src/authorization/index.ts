import type { KeyStore } from '../identity/key-store.js';
import { KeyAuthorizationResolver } from './key-resolver.js';
import { AuthorizationRegistry } from './registry.js';

/**
 * The registry the gateway starts with: the legacy key resolver, and nothing
 * behind a token. It shares the app clock, so a grant deadline is checked
 * against the same time the outbox and the pages use.
 */
export function createAuthorizationRegistry(keys: KeyStore, now: () => Date = () => new Date()): AuthorizationRegistry {
  const registry = new AuthorizationRegistry(now);
  registry.register(new KeyAuthorizationResolver(keys));
  return registry;
}

export * from './caller.js';
export * from './key-resolver.js';
export * from './refusal.js';
export * from './registry.js';
export * from './types.js';
