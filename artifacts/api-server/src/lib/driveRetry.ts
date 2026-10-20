// Drive rate-limit, server and dropped-connection errors are worth a few retries with a growing
// pause; anything else (permissions, a missing file) is a real failure and is thrown at once.
const NETWORK = new Set(["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ECONNREFUSED", "EPIPE"]);

export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const e = err as { code?: number | string; errors?: { reason?: string }[]; message?: string };
      const reason = e.errors?.[0]?.reason ?? "";
      const retryable =
        e.code === 429 ||
        (typeof e.code === "number" && e.code >= 500) ||
        (typeof e.code === "string" && NETWORK.has(e.code)) ||
        /ECONNRESET|ETIMEDOUT|socket hang up/.test(e.message ?? "") ||
        /ateLimit|uotaExceeded/.test(reason);
      if (i >= 5 || !retryable) throw err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
}
