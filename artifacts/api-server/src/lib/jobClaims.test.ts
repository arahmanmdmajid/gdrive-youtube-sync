// Race tests for the upload claim and undo, run against a real Postgres.
//
// They only run when TEST_DATABASE_URL points at a LOCAL database (localhost / 127.0.0.1). Never point
// it at the real one: the tests insert and delete job rows. The schema must already exist, e.g.
//   docker run -d --name dtt-test-pg -e POSTGRES_PASSWORD=test -p 54329:5432 postgres:16-alpine
//   DATABASE_URL=postgres://postgres:test@localhost:54329/postgres pnpm --filter @workspace/db run push-force
//   TEST_DATABASE_URL=postgres://postgres:test@localhost:54329/postgres pnpm --filter @workspace/api-server run test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

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
  claims: typeof import("./jobClaims");
  eq: typeof import("drizzle-orm").eq;
  inArray: typeof import("drizzle-orm").inArray;
};
let m: Mods;
const created: number[] = [];
let seq = 0;

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = url; // read when @workspace/db is first imported
  const dbMod = await import("@workspace/db");
  const orm = await import("drizzle-orm");
  m = {
    db: dbMod.db,
    pool: dbMod.pool,
    jobsTable: dbMod.jobsTable,
    claims: await import("./jobClaims"),
    eq: orm.eq,
    inArray: orm.inArray,
  };
});

after(async () => {
  if (skip || !m) return;
  if (created.length) await m.db.delete(m.jobsTable).where(m.inArray(m.jobsTable.id, created));
  await m.pool.end();
});

async function newJob(status: "pending" | "needs_review" | "processing" | "done" | "rejected", title: string | null = "T") {
  const [row] = await m.db
    .insert(m.jobsTable)
    .values({ driveFileId: `test-${Date.now()}-${seq++}`, driveFileName: "x", status, proposedTitle: title })
    .returning();
  created.push(row.id);
  return row;
}
const statusOf = async (id: number) => (await m.db.select().from(m.jobsTable).where(m.eq(m.jobsTable.id, id)))[0].status;

test("only one of many simultaneous claims wins", { skip }, async () => {
  const job = await newJob("pending");
  const results = await Promise.all(Array.from({ length: 20 }, () => m.claims.claimPendingJob(job.id)));
  assert.equal(results.filter((r) => r !== null).length, 1);
  assert.equal(await statusOf(job.id), "processing");
});

test("claim and undo racing: exactly one wins and the status matches the winner (200 rounds)", { skip }, async () => {
  let claimedWins = 0;
  let undoWins = 0;
  for (let i = 0; i < 200; i++) {
    const job = await newJob("pending");
    // alternate who starts first so neither order is favoured
    const [a, b] = await Promise.all(
      i % 2 === 0
        ? [m.claims.claimPendingJob(job.id), m.claims.undoPendingJob(job.id)]
        : [m.claims.undoPendingJob(job.id), m.claims.claimPendingJob(job.id)].reverse(),
    );
    const claimed = a !== null;
    const undone = b !== null;
    assert.notEqual(claimed, undone, `round ${i}: both or neither won`);
    assert.equal(await statusOf(job.id), claimed ? "processing" : "needs_review");
    if (claimed) claimedWins++;
    else undoWins++;
  }
  // sanity: the test really exercised both outcomes at least once, otherwise it proves little
  assert.ok(claimedWins > 0 && undoWins > 0, `claim wins=${claimedWins}, undo wins=${undoWins}`);
});

test("a stale pending list cannot upload a job that was undone after the list was read", { skip }, async () => {
  const jobs = [await newJob("pending", "A"), await newJob("pending", "B"), await newJob("pending", "C")];
  const staleList = [...jobs]; // what processAllPendingJobs holds
  await m.claims.undoPendingJob(jobs[1].id);
  const claimed: number[] = [];
  for (const j of staleList) if (await m.claims.claimPendingJob(j.id)) claimed.push(j.id);
  assert.deepEqual(claimed, [jobs[0].id, jobs[2].id]);
  assert.equal(await statusOf(jobs[1].id), "needs_review");
});

test("a claim returns the current title, not the one the caller read earlier", { skip }, async () => {
  const job = await newJob("pending", "Old title");
  const stale = { ...job };
  await m.db.update(m.jobsTable).set({ proposedTitle: "New title" }).where(m.eq(m.jobsTable.id, job.id));
  const claimed = await m.claims.claimPendingJob(job.id);
  assert.equal(stale.proposedTitle, "Old title");
  assert.equal(claimed?.proposedTitle, "New title");
});

test("undo does nothing once the job is claimed", { skip }, async () => {
  const job = await newJob("processing");
  assert.equal(await m.claims.undoPendingJob(job.id), null);
  assert.equal(await statusOf(job.id), "processing");
});

test("approve applies only while the job is in needs_review", { skip }, async () => {
  const fresh = await newJob("needs_review");
  const ok = await m.claims.approveIfNeedsReview(fresh.id, { proposedTitle: "Approved" });
  assert.equal(ok?.status, "pending");
  assert.equal(ok?.proposedTitle, "Approved");

  const rejected = await newJob("rejected", "Keep");
  assert.equal(await m.claims.approveIfNeedsReview(rejected.id, { proposedTitle: "Nope" }), null);
  const [row] = await m.db.select().from(m.jobsTable).where(m.eq(m.jobsTable.id, rejected.id));
  assert.equal(row.status, "rejected");
  assert.equal(row.proposedTitle, "Keep");
});

test("pre-upload check: empty title and a title already uploaded are blocked", { skip }, async () => {
  const title = `Dup title ${Date.now()}`;
  const mine = await newJob("processing", title);
  assert.equal(await m.claims.uploadBlockReason(mine.id, title), null, "alone with its title");
  assert.match((await m.claims.uploadBlockReason(mine.id, "   ")) ?? "", /empty/);

  const done = await newJob("done", title);
  assert.match((await m.claims.uploadBlockReason(mine.id, title)) ?? "", new RegExp(`#${done.id}`));

  const other = `Other ${Date.now()}`;
  await newJob("rejected", other);
  await newJob("needs_review", other);
  assert.equal(await m.claims.uploadBlockReason(mine.id, other), null, "rejected and needs_review do not block");
});
