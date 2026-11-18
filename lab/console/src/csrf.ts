import { randomBytes, timingSafeEqual } from 'node:crypto';

/** A form older than this has to be reloaded. The console has no session to expire with it. */
export const CSRF_TTL_MS = 30 * 60 * 1000;

/** Enough live pages for one operator, few enough that the set never grows without bound. */
const MAX_TOKENS = 200;

/**
 * The console has no login, so a token is not tied to a session. It is a random
 * value handed to the page that draws the buttons, kept only in memory and
 * valid for a while (ADR-0006 section 3.1). A `POST` must carry it, and must
 * come from the console's own `Origin`, so a page on another site cannot press
 * the test buttons through the operator's browser.
 */
export class CsrfTokens {
  private readonly live = new Map<string, number>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  issue(): string {
    this.prune();
    const token = randomBytes(32).toString('base64url');
    this.live.set(token, this.now() + CSRF_TTL_MS);
    while (this.live.size > MAX_TOKENS) {
      const oldest = this.live.keys().next();
      if (oldest.done === true) break;
      this.live.delete(oldest.value);
    }
    return token;
  }

  check(token: string): boolean {
    this.prune();
    if (token === '') return false;
    const given = Buffer.from(token);
    let found = false;
    // Compare against every live token, so the loop takes the same time whichever one matched.
    for (const candidate of this.live.keys()) {
      const known = Buffer.from(candidate);
      if (known.length === given.length && timingSafeEqual(known, given)) found = true;
    }
    return found;
  }

  private prune(): void {
    const now = this.now();
    for (const [token, expiry] of this.live) {
      if (expiry <= now) this.live.delete(token);
    }
  }
}

/**
 * A form from another site carries its own `Origin`. The `Host` check already
 * proved the request names this console, so comparing the two is enough. A
 * request with no `Origin` (curl, a test) is refused here on purpose: every
 * `POST` of this console comes from one of its own forms.
 */
export function sameConsoleOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (origin === undefined || host === undefined) return false;
  return origin.toLowerCase() === `http://${host.toLowerCase()}`;
}
