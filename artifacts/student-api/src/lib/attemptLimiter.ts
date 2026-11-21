/**
 * Counts failed attempts per key inside a sliding window, in memory. A restart clears it, which is fine for a
 * small class on one instance: it only has to make guessing the invite code slow.
 */
export interface AttemptLimiter {
  /** True when the key has used up its failures inside the window. */
  blocked(key: string): boolean;
  fail(key: string): void;
  clear(key: string): void;
}

export function createAttemptLimiter(opts: { max: number; windowMs: number; now?: () => number }): AttemptLimiter {
  const now = opts.now ?? Date.now;
  const failures = new Map<string, number[]>();
  const recent = (key: string): number[] => {
    const cutoff = now() - opts.windowMs;
    const kept = (failures.get(key) ?? []).filter((t) => t > cutoff);
    if (kept.length) failures.set(key, kept);
    else failures.delete(key);
    return kept;
  };
  return {
    blocked: (key) => recent(key).length >= opts.max,
    fail: (key) => {
      failures.set(key, [...recent(key), now()]);
    },
    clear: (key) => {
      failures.delete(key);
    },
  };
}
