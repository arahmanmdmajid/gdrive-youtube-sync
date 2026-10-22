// Storage and picking of teacher reads, on a real Postgres. Set TEST_DATABASE_URL to a LOCAL database, as in
// jobClaims.test.ts. The tests insert and delete their own rows (jobs, alias rows, read rows).
import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { entriesFromRows, rowsFromEntries, aliasHash } from "./teacherAliasTable";
import type { AliasEntry } from "./teacherTile";
import type { ReadResult } from "./teacherReader";

const url = process.env.TEST_DATABASE_URL;
const skip = !url
  ? "TEST_DATABASE_URL is not set"
  : !/^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1)[:/]/.test(url)
    ? "TEST_DATABASE_URL must point at localhost"
    : false;

const ALIASES: AliasEntry[] = [
  { teacher: "Ustad Alpha", strong: ["alphonse"], weak: ["khan", "ahmed"] },
  { teacher: "Ustad Beta", allOf: ["b", "sh"] },
];
const SECRET_TEXT = "ZZSECRETSTUDENTZZ";

type Mods = {
  db: typeof import("@workspace/db").db;
  pool: typeof import("@workspace/db").pool;
  jobsTable: typeof import("@workspace/db").jobsTable;
  reads: typeof import("@workspace/db").recordingTeacherReadsTable;
  aliasesTable: typeof import("@workspace/db").teacherAliasesTable;
  t: typeof import("./teacherReads");
  eq: typeof import("drizzle-orm").eq;
  inArray: typeof import("drizzle-orm").inArray;
};
let m: Mods;
const jobIds: number[] = [];
let seq = 0;

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = url;
  const dbMod = await import("@workspace/db");
  const orm = await import("drizzle-orm");
  m = { db: dbMod.db, pool: dbMod.pool, jobsTable: dbMod.jobsTable, reads: dbMod.recordingTeacherReadsTable, aliasesTable: dbMod.teacherAliasesTable, t: await import("./teacherReads"), eq: orm.eq, inArray: orm.inArray };
});

afterEach(async () => {
  if (skip || !m) return;
  if (jobIds.length) {
    await m.db.delete(m.reads).where(m.inArray(m.reads.jobId, jobIds));
    await m.db.delete(m.jobsTable).where(m.inArray(m.jobsTable.id, jobIds));
    jobIds.length = 0;
  }
  await m.db.delete(m.aliasesTable);
});

after(async () => {
  if (skip || !m) return;
  await m.pool.end();
});

async function newJob(over: Partial<typeof import("@workspace/db").jobsTable.$inferInsert> = {}) {
  const [row] = await m.db
    .insert(m.jobsTable)
    .values({
      driveFileId: `tr-${Date.now()}-${seq++}`,
      driveFileName: "x",
      status: "needs_review",
      contentType: "video",
      durationSeconds: 1500,
      driveCreatedTime: new Date(Date.UTC(2026, 9, 1, 12, seq)).toISOString(),
      ...over,
    })
    .returning();
  jobIds.push(row.id);
  return row;
}

const okRead = (teacher: string | null = "Ustad Alpha"): ReadResult => ({
  status: "ok", teacher, ambiguous: false, matched: teacher ? [teacher] : [], framesTotal: 4, framesRead: 4, framesMatched: teacher ? 2 : 0, error: null,
});
const failedRead = (): ReadResult => ({ status: "failed", teacher: null, ambiguous: false, matched: [], framesTotal: 4, framesRead: 0, framesMatched: 0, error: "no frame could be read from Drive" });

test("aliases: replace and load round-trip, and a second replace removes the old words", { skip }, async () => {
  const n = await m.t.replaceAliases(ALIASES);
  assert.equal(n, 5);
  assert.deepEqual(await m.t.loadAliases(), entriesFromRows(rowsFromEntries(ALIASES)));
  await m.t.replaceAliases([{ teacher: "Ustad Gamma", strong: ["gammaro"] }]);
  const after = await m.t.loadAliases();
  assert.deepEqual(after.map((e) => e.teacher), ["Ustad Gamma"]);
  await m.t.replaceAliases([]);
  assert.deepEqual(await m.t.loadAliases(), []);
});

test("saving a read twice keeps one row per job and the latest values", { skip }, async () => {
  const job = await newJob();
  await m.t.saveRead(job.id, failedRead(), "h1");
  await m.t.saveRead(job.id, okRead(), "h2");
  const rows = await m.db.select().from(m.reads).where(m.eq(m.reads.jobId, job.id));
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].status, rows[0].teacher, rows[0].aliasHash, rows[0].error, rows[0].framesMatched], ["ok", "Ustad Alpha", "h2", null, 2]);
  assert.equal(rows[0].matched, JSON.stringify(["Ustad Alpha"]));
});

test("picking: in review, video, with a length, not read with the current table; oldest first; limited", { skip }, async () => {
  const hash = aliasHash(ALIASES);
  const oldest = await newJob({ driveCreatedTime: "2026-09-01T10:00:00.000Z" });
  const newer = await newJob({ driveCreatedTime: "2026-09-02T10:00:00.000Z" });
  await newJob({ status: "done" });
  await newJob({ status: "pending" });
  await newJob({ contentType: "audio" });
  await newJob({ durationSeconds: null });
  const readOk = await newJob({ driveCreatedTime: "2026-08-01T10:00:00.000Z" });
  await m.t.saveRead(readOk.id, okRead(), hash);
  const staleTable = await newJob({ driveCreatedTime: "2026-09-03T10:00:00.000Z" });
  await m.t.saveRead(staleTable.id, okRead(), "an-older-table");

  const picked = await m.t.pickJobsToRead(hash, 10);
  const mine = picked.filter((p) => jobIds.includes(p.id)).map((p) => p.id);
  assert.deepEqual(mine, [oldest.id, newer.id, staleTable.id], "excludes finished, pending, audio, no length, and already read");
  const limited = (await m.t.pickJobsToRead(hash, 1)).filter((p) => jobIds.includes(p.id));
  assert.deepEqual(limited.map((p) => p.id), [oldest.id]);
});

test("picking: a recent failed read waits, an old one is tried again", { skip }, async () => {
  const hash = aliasHash(ALIASES);
  const recent = await newJob({ driveCreatedTime: "2026-09-01T10:00:00.000Z" });
  const old = await newJob({ driveCreatedTime: "2026-09-02T10:00:00.000Z" });
  await m.t.saveRead(recent.id, failedRead(), hash);
  await m.t.saveRead(old.id, failedRead(), hash);
  await m.db.update(m.reads).set({ readAt: new Date(Date.now() - m.t.RETRY_FAILED_AFTER_MS - 1000) }).where(m.eq(m.reads.jobId, old.id));
  const picked = (await m.t.pickJobsToRead(hash, 10)).filter((p) => jobIds.includes(p.id)).map((p) => p.id);
  assert.deepEqual(picked, [old.id]);
});

test("a run reads a bounded number, stores only verdicts, and never stores the recognized text", { skip }, async () => {
  await m.t.replaceAliases(ALIASES);
  const jobs = [await newJob({ driveCreatedTime: "2026-09-01T10:00:00.000Z" }), await newJob({ driveCreatedTime: "2026-09-02T10:00:00.000Z" }), await newJob({ driveCreatedTime: "2026-09-03T10:00:00.000Z" })];
  let framesAsked = 0;
  const stub = {
    extract: async (_id: string, _d: number, dir: string) => ({ paths: [`${dir}/a.jpg`, `${dir}/b.jpg`], failed: 2 }),
    ocr: async (paths: string[]) => {
      framesAsked += paths.length;
      return paths.map(() => `${SECRET_TEXT} Ustad Alphonse`);
    },
  };

  const first = await m.t.runReads(2, stub);
  assert.equal(first.skipped, null);
  assert.equal(first.attempted, 2);
  assert.deepEqual(first.results.map((r) => [r.jobId, r.status, r.teacher]), [[jobs[0].id, "ok", "Ustad Alpha"], [jobs[1].id, "ok", "Ustad Alpha"]]);
  assert.equal(framesAsked, 4);

  const second = await m.t.runReads(2, stub);
  assert.equal(second.attempted, 1, "only the third was left");
  const third = await m.t.runReads(2, stub);
  assert.equal(third.attempted, 0, "nothing left to read");

  const stored = await m.db.select().from(m.reads).where(m.inArray(m.reads.jobId, jobs.map((j) => j.id)));
  assert.equal(stored.length, 3);
  assert.ok(!JSON.stringify(stored).includes(SECRET_TEXT), "the recognized text is not in the database");
  assert.ok(!JSON.stringify(first).includes(SECRET_TEXT), "nor in the run summary");
});

test("a run with an empty alias table does nothing", { skip }, async () => {
  await newJob();
  const r = await m.t.runReads(2, { extract: async () => ({ paths: [], failed: 0 }), ocr: async () => [] });
  assert.equal(r.attempted, 0);
  assert.match(r.skipped!, /alias table is empty/);
});

test("changing the alias table makes the reads out of date", { skip }, async () => {
  await m.t.replaceAliases(ALIASES);
  const job = await newJob();
  const stub = { extract: async (_i: string, _d: number, dir: string) => ({ paths: [`${dir}/a.jpg`], failed: 3 }), ocr: async (p: string[]) => p.map(() => "alphonse") };
  assert.equal((await m.t.runReads(5, stub)).attempted >= 1, true);
  assert.equal((await m.t.pickJobsToRead(aliasHash(ALIASES), 10)).some((p) => p.id === job.id), false, "up to date");
  await m.t.replaceAliases([...ALIASES, { teacher: "Ustad Gamma", strong: ["gammaro"] }]);
  assert.equal((await m.t.pickJobsToRead(aliasHash(await m.t.loadAliases()), 10)).some((p) => p.id === job.id), true, "due again with the new table");
});

test("only one run at a time", { skip }, async () => {
  await m.t.replaceAliases(ALIASES);
  await newJob();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const slow = { extract: async (_i: string, _d: number, dir: string) => ({ paths: [`${dir}/a.jpg`], failed: 3 }), ocr: async (p: string[]) => { await gate; return p.map(() => ""); } };
  const running = m.t.runReads(1, slow);
  await new Promise((r) => setTimeout(r, 50));
  setTimeout(release, 300); // a safety net: if the guard is missing the second run must not hang the suite
  const second = await m.t.runReads(1, slow);
  assert.equal(second.skipped, "a run is already in progress");
  release();
  await running;
});
