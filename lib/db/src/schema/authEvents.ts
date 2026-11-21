import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const AUTH_EVENTS = ["login_ok", "login_failed", "register", "reset_ok", "reset_refused"] as const;
export type AuthEventKind = (typeof AUTH_EVENTS)[number];

// Who tried to sign in, register or reset a password, and how it went (issue #126). Never holds a password, an
// invite code or a token. The address is only a salted hash.
export const authEventsTable = pgTable(
  "auth_events",
  {
    id: serial("id").primaryKey(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    event: text("event", { enum: AUTH_EVENTS }).notNull(),
    // As typed, trimmed and lower case, at most 50 characters. Empty when none was given.
    username: text("username").notNull().default(""),
    userId: integer("user_id"),
    // Why it failed: unknown_user, wrong_password, wrong_invite_code, too_many_attempts, no_student.
    reason: text("reason"),
    ipHash: text("ip_hash"),
  },
  (t) => [index("auth_events_created_idx").on(t.createdAt), index("auth_events_username_idx").on(t.username)],
);

export type AuthEvent = typeof authEventsTable.$inferSelect;
