import { boolean, index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Append-only history of every proposal and review decision. Rows are only ever inserted, so an
// edit, cascade, swap or merge never overwrites what was there before (jobs.proposedTitle only
// holds the current value). No foreign key on purpose: a hard-deleted job must not erase its history.
export const jobDecisionsTable = pgTable(
  "job_decisions",
  {
    id: serial("id").primaryKey(),
    // Rows written by one action (the job acted on plus every job it changed) share this id.
    groupEventId: text("group_event_id").notNull(),
    jobId: integer("job_id").notNull(),
    // "subject" = the job the action was on; "affected" = another job the action changed.
    role: text("role", { enum: ["subject", "affected"] }).notNull(),
    // proposal, reproposal, approve, edit, reject, restore. Plain text so later stages can add types.
    eventType: text("event_type").notNull(),
    actor: text("actor", { enum: ["admin", "system"] }).notNull(),
    // "swap", "merge" or "cascade" when the action changed more than one job.
    detail: text("detail"),
    fromTitle: text("from_title"),
    toTitle: text("to_title"),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    fromConfirmed: boolean("from_confirmed"),
    toConfirmed: boolean("to_confirmed"),
    // Filled when a person gives a reason (no dashboard field for it yet).
    reason: text("reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("job_decisions_job_id_idx").on(t.jobId),
    index("job_decisions_group_event_id_idx").on(t.groupEventId),
  ],
);

export type JobDecision = typeof jobDecisionsTable.$inferSelect;
