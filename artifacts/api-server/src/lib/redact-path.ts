/**
 * Some URLs carry a capability in the path (a campaign's lead-intake token).
 * Anything that writes a request path to a log goes through here so the log
 * never holds a replayable secret.
 */
const SECRET_SEGMENTS: ReadonlyArray<RegExp> = [/(\/webhooks\/leads\/)[^/?#]+/g]

export function redactSecretPath(path: string): string {
  let out = path
  for (const re of SECRET_SEGMENTS) out = out.replace(re, "$1[redacted]")
  return out
}
