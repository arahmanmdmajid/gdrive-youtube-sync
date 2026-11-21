import type { Request } from "express";
import { db, authEventsTable } from "@workspace/db";
import { desc, gte } from "drizzle-orm";
import { logger } from "./logger";
import { cleanUsername, clientIp, hashIp, type EventKind } from "./authEvents";

/**
 * Writes one row to the activity log. It never throws and never waits for a caller to care: if the table is missing
 * or the database is down, a warning is logged and the sign-in carries on (issue #126).
 */
export async function recordAuthEvent(
  req: Request,
  event: EventKind,
  info: { username?: unknown; userId?: number | null; reason?: string | null } = {},
): Promise<void> {
  try {
    const ip = clientIp(req.headers, req.socket?.remoteAddress);
    await db.insert(authEventsTable).values({
      event,
      username: cleanUsername(info.username),
      userId: info.userId ?? null,
      reason: info.reason ?? null,
      ipHash: hashIp(ip, process.env.JWT_SECRET ?? ""),
    });
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err), event }, "Could not record the sign-in event");
  }
}

/** The latest events, newest first, and the last 7 days of them for the counts. */
export async function loadAuthEvents(limit: number) {
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const [recent, week] = await Promise.all([
    db.select().from(authEventsTable).orderBy(desc(authEventsTable.createdAt), desc(authEventsTable.id)).limit(limit),
    db.select({ event: authEventsTable.event, createdAt: authEventsTable.createdAt }).from(authEventsTable).where(gte(authEventsTable.createdAt, since)),
  ]);
  return { recent, week };
}
