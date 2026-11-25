/** The longest free text from a system that one answer may carry (issue #155). */
export const MAX_UNTRUSTED_TEXT = 50_000;

/**
 * Cut free text from a system at the limit and say whether it was cut. The
 * caller also marks the answer as untrusted content, because the text came
 * from a system and is never an instruction to the model.
 */
export function clipUntrustedText(text: string): { readonly text: string; readonly truncated: boolean } {
  if (text.length <= MAX_UNTRUSTED_TEXT) return { text, truncated: false };
  return { text: text.slice(0, MAX_UNTRUSTED_TEXT), truncated: true };
}
