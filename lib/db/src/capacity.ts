/** Follow wrapped Drizzle/driver causes without trusting arbitrary error text. */
export function isDatabaseUnavailable(error: unknown): boolean {
  const seen = new Set<unknown>();
  while (error && typeof error === "object" && !seen.has(error)) {
    seen.add(error);
    const e = error as { code?: string; message?: string; cause?: unknown };
    if (["53300", "EMAXCONNSESSION", "ECONNREFUSED", "ECONNRESET", "57P01", "57P03"].includes(e.code ?? "") ||
      /EMAXCONNSESSION|max clients reached|too many clients|timeout exceeded when trying to connect|Connection terminated due to connection timeout/i.test(e.message ?? "")) return true;
    error = e.cause;
  }
  return false;
}

export const DATABASE_UNAVAILABLE_MESSAGE =
  "The database is temporarily busy or unavailable. Wait a few seconds, then retry loading. If you were saving a change, refresh and check whether it saved before submitting again.";
