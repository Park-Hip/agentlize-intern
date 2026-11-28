import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * The seam the login and consent pages of the next issue plug into
 * (oauth-plan section 7). The OAuth router owns the protocol; a web handler
 * owns the page. When no handler is registered the router answers 503 and the
 * provider's development interactions stay disabled, so a production build
 * cannot be talked into issuing a code without a real page.
 */
export interface OAuthInteractionDetails {
  readonly uid: string;
  /** `login`, `consent`, or another prompt the provider names. */
  readonly prompt: string;
  /** The prompt details, such as `missingOIDCScope` and `missingResourceScopes`. */
  readonly promptDetails: Readonly<Record<string, unknown>>;
  readonly params: Readonly<Record<string, string>>;
  readonly clientId: string;
  readonly accountId: string | null;
  readonly grantId: string | null;
}

/** The result shapes the provider accepts: a login, a consent, or an access denial. */
export interface OAuthInteractionResult {
  readonly login?: { readonly accountId: string; readonly remember?: boolean };
  readonly consent?: { readonly grantId: string };
  readonly error?: string;
  readonly error_description?: string;
}

export interface OAuthInteractionContext {
  readonly req: IncomingMessage;
  readonly res: ServerResponse;
  readonly method: string;
  readonly path: string;
  readonly details: OAuthInteractionDetails;
  /** Complete the interaction with an explicit provider result and send the redirect. */
  finish(result: OAuthInteractionResult, options?: { readonly mergeWithLastSubmission?: boolean }): Promise<void>;
  /** Finish the `login` prompt for one employee code and start the session. */
  login(accountId: string): Promise<void>;
  /** Add the missing OIDC and resource scopes to the grant and finish the `consent` prompt. */
  approve(): Promise<void>;
  /** Finish with `access_denied`; no usable token follows. */
  deny(description?: string): Promise<void>;
}

export interface OAuthInteractionHandler {
  /**
   * Answer one `/interaction/<uid>` request. The handler writes the response,
   * either with a page of its own or through one of the context methods.
   */
  handle(context: OAuthInteractionContext): Promise<void>;
}
