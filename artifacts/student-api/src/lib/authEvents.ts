import { createHash } from "node:crypto";

// Pure helpers for the sign-in activity log (issue #126). No database here, so they can be tested alone.

export const EVENT_KINDS = ["login_ok", "login_failed", "register", "reset_ok", "reset_refused"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/** The username as it is stored: trimmed, lower case, at most 50 characters. Anything but a string gives "". */
export function cleanUsername(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase().slice(0, 50) : "";
}

/** The caller's address: the first one in x-forwarded-for (Render sits behind a proxy), else the socket's. */
export function clientIp(headers: Record<string, string | string[] | undefined>, socketAddress: string | undefined): string {
  const forwarded = headers["x-forwarded-for"];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
  return first || socketAddress || "";
}

/** A salted, shortened hash: enough to see one device failing again and again, not to say whose it is. */
export function hashIp(ip: string, salt: string): string | null {
  return ip ? createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 16) : null;
}

type Counts = Record<EventKind, number>;
const zero = (): Counts => ({ login_ok: 0, login_failed: 0, register: 0, reset_ok: 0, reset_refused: 0 });

export function summarizeEvents(events: { event: string; createdAt: Date }[], now: number): { last24h: Counts; last7d: Counts } {
  const last24h = zero();
  const last7d = zero();
  for (const e of events) {
    if (!(EVENT_KINDS as readonly string[]).includes(e.event)) continue;
    const age = now - e.createdAt.getTime();
    if (age < 7 * 24 * 3600 * 1000) last7d[e.event as EventKind]++;
    if (age < 24 * 3600 * 1000) last24h[e.event as EventKind]++;
  }
  return { last24h, last7d };
}
