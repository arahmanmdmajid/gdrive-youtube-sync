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
  reads: typeof import("@workspace/db").recordingTeacherReadsTable;
  aliasesTable: typeof import("@workspace/db").teacherAliasesTable;
  tr: typeof import("./teacherReads");
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
    reads: dbMod.recordingTeacherReadsTable,
    aliasesTable: dbMod.teacherAliasesTable,
    tr: await import("./teacherReads"),
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
  if (skip || !m) return;
  await m.db.delete(m.aliasesTable);
  delete process.env.AUTO_REVIEW_TEACHER;
  if (jobIds.length === 0) return;
  await m.db.delete(m.reads).where(m.inArray(m.reads.jobId, jobIds));
  await m.db.delete(m.decisions).where(m.inArray(m.decisions.jobId, jobIds));
  await m.db.delete(m.jobsTable).where(m.inArray(m.jobsTable.id, jobIds));
  jobIds.length = 0;
});

after(async () => {
  if (skip || !m) return;
  if (jobIds.length) {
    await m.db.delete(m.reads).where(m.inArray(m.reads.jobId, jobIds));
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
    assert.deepEqual(d.teacherEvidence, { identified: 0, of: 6, consistentSplits: null, resolvedAmbiguity: false }, "no evidence read yet");
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

test("a slot with a start day: the Monday before it is judged with 6 slots (clean), the Monday after with 7 (count mismatch), in one run", { skip }, async () => {
  const weekEarlier: GroupInput = {
    ...cleanDay,
    date: "05-10-2026",
    files: cleanDay.files.map((f) => ({
      ...f,
      createdTime: new Date(Date.parse(f.createdTime) - 7 * 24 * 3600 * 1000).toISOString(),
      title: f.title?.replace("12-10-2026", "05-10-2026") ?? null,
    })),
  };
  const [extra] = await m.db
    .insert(m.slotsTable)
    .values({ dayOfWeek: 1, timeSlot: "21:00", serial: "4.1", subjectAr: "x", teacherAr: "x", subjectEn: "Tawzeeh Part 1", teacherEn: "Ustad Atiqullah", effectiveFrom: "2026-10-08" })
    .returning();
  try {
    const early = (await seedCleanDay("needs_review", weekEarlier)).map((j) => j.id);
    const late = (await seedCleanDay("needs_review", cleanDay)).map((j) => j.id);
    const groups = await m.run.evaluateAllGroups();
    const verdictOf = (ids: number[]) => groups.find((g) => g.needsReviewJobIds.includes(ids[0]))?.verdict;
    assert.equal(verdictOf(early)?.verdict, "clean", "before the start day the 21:00 slot does not exist");
    assert.equal(verdictOf(late)?.verdict, "hold", "on a later Monday there are 7 slots for 6 recordings");
    assert.ok(verdictOf(late)?.reasons.some((r) => r.check === "count_mismatch"));
  } finally {
    await m.db.delete(m.slotsTable).where(m.eq(m.slotsTable.id, extra.id));
  }
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

// ── Teacher evidence from stored reads ─────────────────────────────────────

const AMBIGUOUS = [[27], [26], [10, 17], [28], [27], [26]]; // the break could belong to several places by length alone
const teacherOfTitle = (title: string) => title.split(" | ")[1];
/** The teacher each recording of AMBIGUOUS really shows: the one scheduled for its lecture. */
const trueTeachers = () => AMBIGUOUS.flatMap((parts, i) => parts.map(() => teacherOfTitle(cleanDay.slots[i].title)));

/** Loads an alias table for the day's teachers and returns its hash (reads must be made with it to count). */
async function loadDayAliases(): Promise<string> {
  const { aliasHash } = await import("./teacherAliasTable");
  const entries = [...new Set(cleanDay.slots.map((s) => teacherOfTitle(s.title)))].map((teacher) => ({ teacher, strong: [teacher.split(" ").pop()!.toLowerCase()] }));
  await m.tr.replaceAliases(entries);
  return aliasHash(entries);
}

const okRead = (teacher: string | null) => ({ status: "ok" as const, teacher, ambiguous: false, matched: teacher ? [teacher] : [], framesTotal: 4, framesRead: 4, framesMatched: teacher ? 3 : 0, error: null });

async function seedAmbiguousDayWithReads(hash: string, over: (i: number) => "skip" | "fail" | "none" | "ok" = () => "ok") {
  const jobs = await seedCleanDay("needs_review", buildDay(AMBIGUOUS));
  const truth = trueTeachers();
  for (const [i, j] of jobs.entries()) {
    const how = over(i);
    if (how === "skip") continue;
    if (how === "fail") await m.tr.saveRead(j.id, { ...okRead(null), status: "failed", error: "no frame could be read from Drive", framesRead: 0 }, hash);
    else await m.tr.saveRead(j.id, okRead(how === "none" ? null : truth[i]), hash);
  }
  return jobs.map((j) => j.id);
}
const groupOf = async (ids: number[], opts: import("./autoReviewRun").EvaluateOptions) => (await m.run.evaluateAllGroups(new Date(), opts)).find((g) => g.needsReviewJobIds.includes(ids[0]))!;

test("teacher reads off (the default): stored reads are ignored and the day stays ambiguous", { skip }, async () => {
  const hash = await loadDayAliases();
  const ids = await seedAmbiguousDayWithReads(hash);
  const plain = await groupOf(ids, {}); // no AUTO_REVIEW_TEACHER in the environment
  assert.deepEqual(plain.verdict.reasons.map((r) => r.check), ["ambiguous_split"]);
  assert.deepEqual(plain.verdict.teacherEvidence, { identified: 0, of: 7, consistentSplits: null, resolvedAmbiguity: false });
  assert.deepEqual(plain.teachers, {});
  const explicitOff = await groupOf(ids, { useTeacher: false });
  assert.deepEqual(explicitOff.teachers, {});
});

test("teacher reads on, every recording read and identified: the ambiguous day resolves to one grouping", { skip }, async () => {
  const hash = await loadDayAliases();
  const ids = await seedAmbiguousDayWithReads(hash);
  const g = await groupOf(ids, { useTeacher: true });
  assert.equal(g.verdict.verdict, "clean", JSON.stringify(g.verdict.reasons));
  assert.deepEqual(g.verdict.teacherEvidence, { identified: 7, of: 7, consistentSplits: 1, resolvedAmbiguity: true });
  assert.deepEqual(g.verdict.lectures.map((l) => l.jobIds.length), [1, 1, 2, 1, 1, 1]);
  assert.equal(Object.keys(g.teachers).length, 7);
  assert.equal(g.teachers[ids[0]], teacherOfTitle(cleanDay.slots[0].title));
});

test("teacher reads on through the environment, and the verdict row records who each recording was read as", { skip }, async () => {
  const hash = await loadDayAliases();
  const ids = await seedAmbiguousDayWithReads(hash);
  process.env.AUTO_REVIEW_TEACHER = "on";
  await m.run.runAutoReview("dry_run");
  const rows = await rowsFor(ids);
  assert.equal(rows.length, 7);
  const d = JSON.parse(rows[0].detail!);
  assert.equal(d.verdict, "clean");
  assert.equal(d.teacherEvidence.resolvedAmbiguity, true);
  assert.equal(Object.keys(d.teachers).length, 7);
  // reading the same again writes nothing; a different reading would
  await m.run.runAutoReview("dry_run");
  assert.equal((await rowsFor(ids)).length, 7);
});

test("a recording with no usable read (none, failed, or read nobody) keeps the day ambiguous", { skip }, async () => {
  const hash = await loadDayAliases();
  for (const how of ["skip", "fail", "none"] as const) {
    const ids = await seedAmbiguousDayWithReads(hash, (i) => (i === 4 ? how : "ok"));
    const g = await groupOf(ids, { useTeacher: true });
    assert.ok(g.verdict.reasons.some((r) => r.check === "ambiguous_split"), how);
    assert.equal(g.verdict.teacherEvidence.identified, 6, how);
    assert.equal(g.verdict.teacherEvidence.resolvedAmbiguity, false, how);
    assert.equal(ids[4] in g.teachers, how === "none", "a nobody-identified read is recorded as null, a missing or failed read is absent");
    await m.db.delete(m.reads).where(m.inArray(m.reads.jobId, ids));
    await m.db.delete(m.jobsTable).where(m.inArray(m.jobsTable.id, ids));
    jobIds.length = 0;
  }
});

test("reads made with an older alias table are ignored", { skip }, async () => {
  const hash = await loadDayAliases();
  const ids = await seedAmbiguousDayWithReads(hash);
  assert.equal((await groupOf(ids, { useTeacher: true })).verdict.verdict, "clean");
  await m.tr.replaceAliases([{ teacher: "Ustad Someone Else", strong: ["elsewhere"] }]); // the table changed
  const g = await groupOf(ids, { useTeacher: true });
  assert.deepEqual(g.teachers, {});
  assert.ok(g.verdict.reasons.some((r) => r.check === "ambiguous_split"));
});

test("a teacher that contradicts the grouping holds the day as a mismatch", { skip }, async () => {
  const hash = await loadDayAliases();
  const ids = await seedAmbiguousDayWithReads(hash);
  await m.tr.saveRead(ids[0], okRead(teacherOfTitle(cleanDay.slots[3].title)), hash); // recording 1 read as lecture 4's teacher
  const g = await groupOf(ids, { useTeacher: true });
  assert.equal(g.verdict.verdict, "hold");
  assert.ok(g.verdict.reasons.some((r) => r.check === "teacher_mismatch"));
});

test("missing read tables do not stop the evaluation: it carries on without evidence", { skip }, async () => {
  const ids = (await seedCleanDay("needs_review", buildDay(AMBIGUOUS))).map((j) => j.id);
  const g = await groupOf(ids, {
    useTeacher: true,
    loadEvidence: async () => {
      throw new Error('relation "recording_teacher_reads" does not exist');
    },
  });
  assert.deepEqual(g.verdict.reasons.map((r) => r.check), ["ambiguous_split"]);
  assert.deepEqual(g.teachers, {});
});

test("the signature changes when only the name a recording was read as changes", { skip }, async () => {
  const hash = await loadDayAliases();
  const ids = await seedAmbiguousDayWithReads(hash);
  // recording 1 read as two different wrong teachers: the verdict, the failed check and the counts are the same
  await m.tr.saveRead(ids[0], okRead(teacherOfTitle(cleanDay.slots[3].title)), hash);
  const a = await groupOf(ids, { useTeacher: true });
  await m.tr.saveRead(ids[0], okRead(teacherOfTitle(cleanDay.slots[4].title)), hash);
  const b = await groupOf(ids, { useTeacher: true });
  assert.deepEqual(a.verdict.reasons.map((r) => r.check), b.verdict.reasons.map((r) => r.check));
  assert.deepEqual(a.verdict.teacherEvidence, b.verdict.teacherEvidence);
  assert.notEqual(a.signature, b.signature, "only the name differs, and that is enough for a new verdict row");
});

test("the signature changes when a recording is read as someone else", { skip }, async () => {
  const hash = await loadDayAliases();
  const ids = await seedAmbiguousDayWithReads(hash);
  const a = (await groupOf(ids, { useTeacher: true })).signature;
  await m.tr.saveRead(ids[1], okRead(null), hash); // now read, nobody identified
  const b = (await groupOf(ids, { useTeacher: true })).signature;
  assert.notEqual(a, b);
});

// ── The agreement report, end to end ───────────────────────────────────────

/** Approves jobs the way the app does (a conditional update inside withDecisionLog), optionally retitling some. */
async function approveLikeTheApp(ids: number[], newTitle: (i: number) => string | undefined = () => undefined) {
  const { withDecisionLog } = await import("./decisions");
  const claims = await import("./jobClaims");
  for (const [i, id] of ids.entries()) {
    await withDecisionLog({ eventType: "approve", actor: "admin", subjectId: id }, async () => {
      const title = newTitle(i);
      if (title) await m.db.update(m.jobsTable).set({ proposedTitle: title }).where(m.eq(m.jobsTable.id, id));
      await claims.approveIfNeedsReview(id, {});
    });
  }
}
const reportDay = async () => (await (await import("./agreementData")).loadAgreementReport()).days.find((d) => d.key === KEY);

test("agreement report: a clean day approved as the rules said is agreed", { skip }, async () => {
  const ids = (await seedCleanDay()).map((j) => j.id);
  await m.run.runAutoReview("dry_run");
  assert.equal((await reportDay())?.outcome, "pending", "before the reviewer acts");
  await approveLikeTheApp(ids);
  const d = await reportDay();
  assert.equal(d?.verdict, "clean");
  assert.equal(d?.outcome, "agreed");
  assert.equal(d?.reviewed, true);
});

test("agreement report: a title changed after a clean verdict is a false clean", { skip }, async () => {
  const ids = (await seedCleanDay()).map((j) => j.id);
  await m.run.runAutoReview("dry_run");
  await approveLikeTheApp(ids, (i) => (i === 3 ? "A title typed by hand" : undefined));
  const d = await reportDay();
  assert.equal(d?.verdict, "clean");
  assert.equal(d?.outcome, "false_clean");
});

test("agreement report: a hold approved unchanged is unnecessary, and with a title change it was held correctly", { skip }, async () => {
  const day = buildDay(AMBIGUOUS);
  const a = (await seedCleanDay("needs_review", day)).map((j) => j.id);
  await m.run.runAutoReview("dry_run");
  await approveLikeTheApp(a);
  const unchanged = await reportDay();
  assert.equal(unchanged?.verdict, "hold");
  assert.equal(unchanged?.outcome, "unnecessary_hold");
  assert.equal(unchanged?.hard, true, "an ambiguous split is a hard day");

  await m.db.delete(m.decisions).where(m.inArray(m.decisions.jobId, a));
  await m.db.delete(m.jobsTable).where(m.inArray(m.jobsTable.id, a));
  jobIds.length = 0;

  const b = (await seedCleanDay("needs_review", day)).map((j) => j.id);
  await m.run.runAutoReview("dry_run");
  await approveLikeTheApp(b, (i) => (i === 2 ? "A different title" : undefined));
  assert.equal((await reportDay())?.outcome, "held_correctly");
});

test("agreement report: a day approved before any verdict was recorded is not comparable", { skip }, async () => {
  const ids = (await seedCleanDay()).map((j) => j.id);
  await approveLikeTheApp(ids);
  await m.run.runAutoReview("dry_run"); // nothing in review any more: no verdict is recorded
  const d = await reportDay();
  assert.equal(d?.outcome, "not_comparable");
});

test("agreement report: building it changes nothing", { skip }, async () => {
  const ids = (await seedCleanDay()).map((j) => j.id);
  await m.run.runAutoReview("dry_run");
  await approveLikeTheApp(ids);
  const before = [await jobsSnapshot(ids), (await rowsFor(ids)).length];
  await (await import("./agreementData")).loadAgreementReport();
  assert.deepEqual([await jobsSnapshot(ids), (await rowsFor(ids)).length], before);
});
