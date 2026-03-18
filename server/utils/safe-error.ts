/**
 * Returns a safe error message for API responses.
 * In production, suppresses internal details (stack traces, SQL, file paths).
 * In development, returns the full message for debugging.
 */
export function safeErrorMessage(error: unknown, fallback = "Internal server error"): string {
  if (process.env.NODE_ENV !== "production") {
    return error instanceof Error ? error.message : fallback;
  }

  if (!(error instanceof Error)) return fallback;

  const msg = error.message;

  // Suppress messages that look like internal details
  if (
    msg.includes("ENOENT") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("ETIMEDOUT") ||
    /\/[a-z].*\.[a-z]{2,4}/i.test(msg) ||  // file paths
    /at\s+\w+\s+\(/i.test(msg) ||            // stack frames
    /relation\s+"/.test(msg) ||               // SQL errors
    /column\s+"/.test(msg) ||
    /syntax error/i.test(msg) ||
    msg.length > 200                          // overly long = probably internal
  ) {
    return fallback;
  }

  return msg;
}
