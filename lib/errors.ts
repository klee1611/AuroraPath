/**
 * Describe an unknown thrown value for logging.
 *
 * Node's fetch (undici) reports every network failure as the opaque message "fetch failed"
 * and hides the real reason — ENOTFOUND, ECONNREFUSED, ETIMEDOUT, certificate errors — on
 * `error.cause`. Logging the message alone turns an actionable DNS or connectivity fault into
 * a dead end, so always unwrap the cause chain.
 */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error)

  const parts = [error.message]
  let cause: unknown = error.cause
  // Guard against a self-referential or deeply nested cause chain.
  for (let depth = 0; cause instanceof Error && depth < 4; depth++) {
    const code = (cause as NodeJS.ErrnoException).code
    parts.push(code ? `${code}: ${cause.message}` : cause.message)
    cause = cause.cause
  }
  return parts.join(' ← ')
}
