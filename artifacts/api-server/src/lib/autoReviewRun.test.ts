// Dry-run integration tests. Real Postgres only: set TEST_DATABASE_URL to a LOCAL database, as in
// jobClaims.test.ts. The tests insert and delete their own rows (jobs, schedule slots, decision rows).
import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { cleanDay, buildDay } from "./autoReview.fixtures";
import type { GroupInput } from "./autoReview";
import { readMode } from "./autoReviewMode";

const url = process.env.TEST_DATABASE_URL;
const skip = !url
  ? "TEST_DATABASE_URL is not set"
  : !/^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1)[:/]/.test(url)
    ? "TEST_DATABASE_URL must point at localhost"
    : false;

type Mods = {
  db: typeof import("@workspace/db").db;
  pool: typeof import("@workspace/db").pool;
  jobsTable: typeof import("@workspace/db").jobsTable;
  decisions: typeof import("@workspace/db").jobDecisionsTable;
  slotsTable: typeof import("@workspace/db").scheduleSlotsTable;
  run: typeof import("./autoReviewRun");
  eq: typeof import("drizzle-orm").eq;
  inArray: typeof import("drizzle-orm").inArray;
};
let m: Mods;
const jobIds: number[] = [];
let seq = 0;
const KEY = `${cleanDay.date}|${cleanDay.meetingCode}`;

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = url;
  const dbMod = await import("@workspace/db");
  const orm = await import("drizzle-orm");
  m = {
    db: dbMod.db,
    pool: dbMod.pool,
    jobsTable: dbMod.jobsTable,
    decisions: dbMod.jobDecisionsTable,
    slotsTable: dbMod.scheduleSlotsTable,
    run: await import("./autoReviewRun"),
    eq: orm.eq,
    inArray: orm.inArray,
  };
  // The clean day's schedule (a Monday), taken from the fixture's expected titles.
  await m.db.delete(m.slotsTable).where(m.eq(m.slotsTable.dayOfWeek, 1));
  await m.db.insert(m.slotsTable).values(
    cleanDay.slots.map((s) => {
      const [first, teacherEn] = s.title.split(" | ");
      const serial = first.split(" ")[0];
      return { dayOfWeek: 1, timeSlot: s.startTime, serial, subjectAr: "x", teacherAr: "x", subjectEn: first.slice(serial.length + 1), teacherEn };
    }),
  );
});

// Each test starts from an empty day, so remove what it seeded.
afterEach(async () => {
  if (skip || !m || jobIds.length === 0) return;
  await m.db.delete(m.decisions).where(m.inArray(m.decisions.jobId, jobIds));
  await m.db.delete(m.jobsTable).where(m.inArray(m.jobsTable.id, jobIds));
  jobIds.length = 0;
});

after(async () => {
  if (skip || !m) return;
  if (jobIds.length) {
    await m.db.delete(m.decisions).where(m.inArray(m.decisions.jobId, jobIds));
    await m.db.delete(m.jobsTable).where(m.inArray(m.jobsTable.id, jobIds));
  }
  await m.db.delete(m.slotsTable).where(m.eq(m.slotsTable.dayOfWeek, 1));
  await m.pool.end();
});

/** Inserts the clean day's recordings as needs_review jobs. */
async function seedCleanDay(status: "needs_review" | "done" = "needs_review", day: GroupInput = cleanDay) {
  const rows = [];
  for (const f of day.files) {
    const [row] = await m.db
      .insert(m.jobsTable)
      .values({
        driveFileId: `ar-${Date.now()}-${seq++}`,
        driveFileName: `${cleanDay.meetingCode} (2026-10-12 17:00 GMT+5)`,
        driveFileSizeBytes: f.sizeBytes,
        driveCreatedTime: f.createdTime,
        durationSeconds: f.durationSec,
        status,
        proposedTitle: f.title,
        youtubeTitle: status === "done" ? f.title : null,
        contentType: "video",
      })
      .returning();
    jobIds.push(row.id);
    rows.push(row);
  }
  return rows;
}
const rowsFor = async (ids: number[]) => m.db.select().from(m.decisions).where(m.inArray(m.decisions.jobId, ids));
const jobsSnapshot = async (ids: number[]) => JSON.stringify((await m.db.select().from(m.jobsTable).where(m.inArray(m.jobsTable.id, ids))).sort((a, b) => a.id - b.id));

// ── mode ───────────────────────────────────────────────────────────────────

test("mode: unset and off mean off, dry_run is dry_run, anything else is off", () => {
  assert.equal(readMode(undefined), "off");
  assert.equal(readMode(""), "off");
  assert.equal(readMode("off"), "off");
  assert.equal(readMode("dry_run"), "dry_run");
  assert.equal(readMode(" DRY_RUN "), "dry_run");
  for (const bad of ["active", "shadow", "true", "1", "dryrun"]) assert.equal(readMode(bad), "off", bad);
});

// ── dry run ────────────────────────────────────────────────────────────────

test("off: nothing is evaluated and nothing is written", { skip }, async () => {
  const jobs = await seedCleanDay();
  const ids = jobs.map((j) => j.id);
  const res = await m.run.runAutoReview("off");
  assert.deepEqual(res, { mode: "off", evaluated: 0, clean: 0, written: 0 });
  assert.equal((await rowsFor(ids)).length, 0);
});

test("dry run: verdict rows are written for the needs_review jobs and no job changes", { skip }, async () => {
  const jobs = await seedCleanDay();
  const ids = jobs.map((j) => j.id);
  const before = await jobsSnapshot(ids);

  const live = (await m.run.evaluateAllGroups()).find((g) => g.needsReviewJobIds.includes(ids[0]));
  assert.equal(live?.verdict.verdict, "clean", "the real clean day is clean against the seeded schedule");

  const res = await m.run.runAutoReview("dry_run");
  assert.ok(res.evaluated >= 1);

  const rows = await rowsFor(ids);
  assert.equal(rows.length, 6, "one row per needs_review job");
  for (const r of rows) {
    assert.equal(r.eventType, "auto_verdict");
    assert.equal(r.actor, "system");
    assert.equal(r.role, "subject");
    assert.equal(r.reason, "clean");
    const d = JSON.parse(r.detail!);
    assert.equal(d.verdict, "clean");
    assert.equal(d.ruleVersion, "2");
    assert.equal(d.splitCount, 1);
    assert.equal(d.lectures.length, 6, "the grouping is recorded");
    assert.deepEqual(d.titleChanges, []);
    assert.equal(d.group, KEY);
    assert.ok(typeof d.signature === "string" && d.signature.length > 0);
  }
  assert.equal(new Set(rows.map((r) => r.groupEventId)).size, 1, "one group event for the day");
  assert.equal(await jobsSnapshot(ids), before, "every job is identical before and after");
});

test("a second run with nothing changed writes nothing", { skip }, async () => {
  const jobs = await seedCleanDay();
  const ids = jobs.map((j) => j.id);
  await m.run.runAutoReview("dry_run");
  const first = (await rowsFor(ids)).length;
  assert.equal(first, 6);
  await m.run.runAutoReview("dry_run");
  assert.equal((await rowsFor(ids)).length, first);
});

test("a change that changes the verdict writes a new row for each job; the old rows stay", { skip }, async () => {
  const jobs = await seedCleanDay();
  const ids = jobs.map((j) => j.id);
  await m.run.runAutoReview("dry_run");
  // one recording becomes a 2 minute one: the whole day holds
  await m.db.update(m.jobsTable).set({ durationSeconds: 120 }).where(m.eq(m.jobsTable.id, ids[2]));
  const res = await m.run.runAutoReview("dry_run");
  assert.ok(res.written >= 6);

  const rows = (await rowsFor(ids)).sort((a, b) => a.id - b.id);
  assert.equal(rows.length, 12, "6 clean rows kept, 6 hold rows added");
  const latest = rows.slice(6).map((r) => JSON.parse(r.detail!));
  for (const d of latest) {
    assert.equal(d.verdict, "hold");
    assert.ok(d.reasons.some((x: { check: string; jobIds: number[] }) => x.check === "short_recording" && x.jobIds.includes(ids[2])));
  }
  assert.match(rows[6].reason!, /hold: .*short_recording/);

  // and it does not repeat
  await m.run.runAutoReview("dry_run");
  assert.equal((await rowsFor(ids)).length, 12);
});

test("a day with no needs_review job is not evaluated", { skip }, async () => {
  const jobs = await seedCleanDay("done");
  const ids = jobs.map((j) => j.id);
  const groups = await m.run.evaluateAllGroups();
  assert.ok(!groups.some((g) => g.key === KEY && g.needsReviewJobIds.some((id) => ids.includes(id))));
  await m.run.runAutoReview("dry_run");
  assert.equal((await rowsFor(ids)).length, 0);
});

test("a day with a break: the grouping, the part titles and the title changes are recorded, and nothing else changes", { skip }, async () => {
  // lecture 3 was cut by a break; its neighbours are too long to join, so there is one grouping
  const day = buildDay([[27], [50], [10, 17], [50], [30], [26]]);
  const jobs = await seedCleanDay("needs_review", day);
  const ids = jobs.map((j) => j.id);
  const before = await jobsSnapshot(ids);

  const res = await m.run.runAutoReview("dry_run");
  assert.ok(res.clean >= 1);

  const rows = await rowsFor(ids);
  assert.equal(rows.length, 7, "one row per recording");
  const d = JSON.parse(rows[0].detail!);
  assert.equal(d.verdict, "clean");
  assert.equal(d.splitCount, 1);
  assert.equal(d.lectures.length, 6);
  const withParts = d.lectures.filter((l: { jobIds: number[] }) => l.jobIds.length > 1);
  assert.equal(withParts.length, 1);
  assert.equal(withParts[0].jobIds.length, 2);
  assert.match(withParts[0].titles[0].title, / \| Part 1$/);
  assert.match(withParts[0].titles[1].title, / \| Part 2$/);
  assert.equal(d.titleChanges.length, 5, "the scan's positional titles after the break would change");
  assert.ok(d.titleChanges.every((c: { jobId: number }) => ids.includes(c.jobId)));

  // the live view agrees and writes nothing more
  const live = (await m.run.evaluateAllGroups()).find((g) => g.needsReviewJobIds.includes(ids[0]))!;
  assert.deepEqual(live.verdict.lectures.map((l) => l.jobIds.length), [1, 1, 2, 1, 1, 1]);
  assert.equal((await rowsFor(ids)).length, 7);

  assert.equal(await jobsSnapshot(ids), before, "no job is changed: titles stay as they were");
});
