// Tests for the exam readiness numbers. The first group is pure. The tests marked "database" need a real
// Postgres: set TEST_DATABASE_URL to a LOCAL database, as in studyPlan.test.ts.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { summarizeLectures, buildReadiness } from "./readiness";

const HOUR = 3600;
const lec = (id: number, durationSeconds: number | null) => ({ id, durationSeconds });
// 3 lectures of 40 hours: 120 hours to study. Today is 62 days before the exam.
const three = [lec(1, 40 * HOUR), lec(2, 40 * HOUR), lec(3, 40 * HOUR)];
const dates = { today: "2026-10-31", examDate: "2027-01-01" };

// ── summarizeLectures ──────────────────────────────────────────────────────

test("summarize adds up total, completed and remaining time", () => {
  const s = summarizeLectures([lec(1, 3600), lec(2, 1800), lec(3, 600)], new Set([1, 3]));
  assert.deepEqual(s.lectures, { total: 3, completed: 2, remaining: 1 });
  assert.deepEqual(s.seconds, { total: 6000, completed: 4200, remaining: 1800 });
  assert.equal(s.approximate, false);
});

test("summarize uses the average of known lengths for a lecture with none, and says so", () => {
  const s = summarizeLectures([lec(1, 3600), lec(2, 1800), lec(3, null)], new Set());
  assert.equal(s.seconds.total, 3600 + 1800 + 2700);
  assert.equal(s.approximate, true);
});

test("summarize with no known length at all counts zero time and is approximate", () => {
  const s = summarizeLectures([lec(1, null), lec(2, null)], new Set());
  assert.equal(s.seconds.total, 0);
  assert.equal(s.approximate, true);
});

test("summarize ignores completed ids that are not lectures, and handles no lectures", () => {
  assert.deepEqual(summarizeLectures([lec(1, 600)], new Set([1, 99])).lectures, { total: 1, completed: 1, remaining: 0 });
  const none = summarizeLectures([], new Set());
  assert.deepEqual(none.seconds, { total: 0, completed: 0, remaining: 0 });
  assert.equal(none.approximate, false);
});

// ── buildReadiness ─────────────────────────────────────────────────────────

test("without a plan it asks for one and still shows the comparison", () => {
  const r = buildReadiness({ lectures: three, completedIds: new Set(), plan: null, ...dates });
  assert.equal(r.state, "needs_plan");
  assert.equal(r.projection, null);
  assert.equal(r.daysToExam, 62);
  assert.match(r.message!, /hours a day you can study/);
  assert.equal(r.comparison.length, 4);
});

test("on track: finish date, days to spare and the message", () => {
  const r = buildReadiness({ lectures: three, completedIds: new Set(), plan: { hoursPerDay: 2, daysPerWeek: 7 }, ...dates });
  assert.equal(r.state, "on_track");
  assert.equal(r.projection!.finishDate, "2026-12-29");
  assert.equal(r.projection!.daysSpare, 3);
  assert.equal(r.message, "At 2 hours a day, you will finish all lectures by 29 December, 3 days before your exam.");
});

test("at risk: days short, the minimum hours and the year of a finish date next year", () => {
  const r = buildReadiness({ lectures: three, completedIds: new Set(), plan: { hoursPerDay: 1, daysPerWeek: 7 }, ...dates });
  assert.equal(r.state, "at_risk");
  assert.equal(r.projection!.daysShort, 57);
  assert.equal(
    r.message,
    "At 1 hour a day, you will finish all lectures by 27 February 2027, 57 days after your exam. To finish on time you need at least 2 hours a day.",
  );
});

test("at risk and not even 24 hours a day is enough", () => {
  const huge = [lec(1, 2000 * HOUR)];
  const r = buildReadiness({ lectures: huge, completedIds: new Set(), plan: { hoursPerDay: 5, daysPerWeek: 7 }, ...dates });
  assert.equal(r.state, "at_risk");
  assert.match(r.message!, /Even 24 hours a day would not be enough/);
});

test("finishing on the exam day and fewer study days a week are said plainly", () => {
  const r = buildReadiness({ lectures: [lec(1, 126 * HOUR)], completedIds: new Set(), plan: { hoursPerDay: 2, daysPerWeek: 7 }, ...dates });
  assert.equal(r.message, "At 2 hours a day, you will finish all lectures by 1 January 2027, on the day of your exam.");
  const w = buildReadiness({ lectures: [lec(1, 10 * HOUR)], completedIds: new Set(), plan: { hoursPerDay: 1.5, daysPerWeek: 5 }, ...dates });
  assert.match(w.message!, /^At 1\.5 hours a day, 5 days a week, you will finish/);
});

test("completed lectures shorten what is left", () => {
  const r = buildReadiness({ lectures: three, completedIds: new Set([1, 2]), plan: { hoursPerDay: 2, daysPerWeek: 7 }, ...dates });
  assert.equal(r.seconds.remaining, 40 * HOUR);
  assert.equal(r.projection!.finishDate, "2026-11-19");
});

test("all lectures completed shows a completion message, not a projection", () => {
  const r = buildReadiness({ lectures: three, completedIds: new Set([1, 2, 3]), plan: { hoursPerDay: 2, daysPerWeek: 7 }, ...dates });
  assert.equal(r.state, "done");
  assert.equal(r.projection, null);
  assert.deepEqual(r.comparison, []);
  assert.match(r.message!, /completed all/);
  const after = buildReadiness({ lectures: three, completedIds: new Set([1, 2, 3]), plan: null, today: "2027-02-01", examDate: dates.examDate });
  assert.equal(after.state, "done", "done wins after the exam date too");
});

test("after the exam date the projection is hidden", () => {
  const r = buildReadiness({ lectures: three, completedIds: new Set(), plan: { hoursPerDay: 2, daysPerWeek: 7 }, today: "2027-01-02", examDate: dates.examDate });
  assert.equal(r.state, "exam_passed");
  assert.equal(r.projection, null);
  assert.equal(r.message, null);
  assert.deepEqual(r.comparison, []);
});

test("no lectures uploaded yet", () => {
  const r = buildReadiness({ lectures: [], completedIds: new Set(), plan: null, ...dates });
  assert.equal(r.state, "no_lectures");
  assert.equal(r.projection, null);
});

test("an approximate total is passed through", () => {
  const r = buildReadiness({ lectures: [lec(1, HOUR), lec(2, null)], completedIds: new Set(), plan: { hoursPerDay: 2, daysPerWeek: 7 }, ...dates });
  assert.equal(r.approximate, true);
});

// ── database ───────────────────────────────────────────────────────────────

const url = process.env.TEST_DATABASE_URL;
const skip = !url
  ? "TEST_DATABASE_URL is not set"
  : !/^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1)[:/]/.test(url)
    ? "TEST_DATABASE_URL must point at localhost"
    : false;

type Mods = {
  db: typeof import("@workspace/db").db;
  pool: typeof import("@workspace/db").pool;
  usersTable: typeof import("@workspace/db").usersTable;
  jobsTable: typeof import("@workspace/db").jobsTable;
  lectureProgressTable: typeof import("@workspace/db").lectureProgressTable;
  data: typeof import("./readinessData");
  plans: typeof import("./studyPlan");
  inArray: typeof import("drizzle-orm").inArray;
};
let m: Mods;
const userIds: number[] = [];
const jobIds: number[] = [];
let seq = 0;

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = url; // read when @workspace/db is first imported
  const dbMod = await import("@workspace/db");
  const orm = await import("drizzle-orm");
  m = {
    db: dbMod.db,
    pool: dbMod.pool,
    usersTable: dbMod.usersTable,
    jobsTable: dbMod.jobsTable,
    lectureProgressTable: dbMod.lectureProgressTable,
    data: await import("./readinessData"),
    plans: await import("./studyPlan"),
    inArray: orm.inArray,
  };
});

after(async () => {
  if (skip || !m) return;
  if (userIds.length) await m.db.delete(m.usersTable).where(m.inArray(m.usersTable.id, userIds));
  if (jobIds.length) await m.db.delete(m.jobsTable).where(m.inArray(m.jobsTable.id, jobIds));
  await m.pool.end();
});

async function newUser() {
  const [row] = await m.db
    .insert(m.usersTable)
    .values({ username: `test-${Date.now()}-${seq++}`, passwordHash: "x", displayName: "T" })
    .returning();
  userIds.push(row.id);
  return row.id;
}
async function newJob(status: "done" | "pending", durationSeconds: number | null) {
  const [row] = await m.db
    .insert(m.jobsTable)
    .values({ driveFileId: `test-${Date.now()}-${seq++}`, driveFileName: "x", status, durationSeconds })
    .returning();
  jobIds.push(row.id);
  return row.id;
}

test("database: readiness counts the student's completed done lectures against all done lectures", { skip }, async () => {
  const user = await newUser();
  const other = await newUser();
  // The database may hold other rows; compare against a baseline taken before adding ours.
  const base = await m.data.loadReadiness(user, { today: "2026-10-31" });
  const a = await newJob("done", 3600);
  const b = await newJob("done", 1800);
  await newJob("pending", 9999); // not a lecture yet
  await m.db.insert(m.lectureProgressTable).values([
    { userId: user, jobId: a, status: "completed" },
    { userId: user, jobId: b, status: "in_progress" },
    { userId: other, jobId: b, status: "completed" },
  ]);
  await m.plans.saveStudyPlan(user, { hoursPerDay: 2, daysPerWeek: 5 });

  const r = await m.data.loadReadiness(user, { today: "2026-10-31" });
  assert.equal(r.lectures.total - base.lectures.total, 2);
  assert.equal(r.lectures.completed - base.lectures.completed, 1, "in progress and other students' rows do not count");
  assert.equal(r.seconds.total - base.seconds.total, 5400);
  assert.equal(r.seconds.completed - base.seconds.completed, 3600);
  assert.deepEqual(r.plan, { hoursPerDay: 2, daysPerWeek: 5 });
});
