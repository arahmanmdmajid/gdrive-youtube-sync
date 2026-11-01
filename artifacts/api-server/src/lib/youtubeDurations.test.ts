// Tests for reading lecture lengths from YouTube. YouTube is stubbed at its boundary. The test marked
// "database" needs a real Postgres: set TEST_DATABASE_URL to a LOCAL database, as in jobClaims.test.ts.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { parseIsoDuration, fetchDurations } from "./youtubeDurations";

/** A stand-in for the YouTube client. `lengths` maps video id to an ISO 8601 duration. */
function stubYoutube(lengths: Record<string, string>) {
  const batches: string[][] = [];
  const client = {
    videos: {
      list: async ({ id }: { id: string[] }) => {
        batches.push(id);
        return { data: { items: id.filter((v) => v in lengths).map((v) => ({ id: v, contentDetails: { duration: lengths[v] } })) } };
      },
    },
  };
  return { client: client as never, batches };
}

test("parseIsoDuration reads hours, minutes, seconds and days", () => {
  assert.equal(parseIsoDuration("PT1H2M30S"), 3750);
  assert.equal(parseIsoDuration("PT25M"), 1500);
  assert.equal(parseIsoDuration("PT45S"), 45);
  assert.equal(parseIsoDuration("PT1H"), 3600);
  assert.equal(parseIsoDuration("P1DT2H"), 93600);
});

test("parseIsoDuration gives null for zero length, missing and unreadable values", () => {
  assert.equal(parseIsoDuration("P0D"), null, "an unfinished upload reports P0D");
  assert.equal(parseIsoDuration("PT0S"), null);
  assert.equal(parseIsoDuration(""), null);
  assert.equal(parseIsoDuration("garbage"), null);
  assert.equal(parseIsoDuration("PT"), null);
  assert.equal(parseIsoDuration(null), null);
  assert.equal(parseIsoDuration(undefined), null);
});

test("fetchDurations asks for 50 ids at a time and returns what YouTube knows", async () => {
  const ids = Array.from({ length: 120 }, (_, i) => `v${i}`);
  const lengths = Object.fromEntries(ids.map((v) => [v, "PT10M"]));
  const { client, batches } = stubYoutube(lengths);
  const result = await fetchDurations(client, ids);
  assert.deepEqual(batches.map((b) => b.length), [50, 50, 20]);
  assert.equal(result.size, 120);
  assert.equal(result.get("v7"), 600);
});

test("fetchDurations skips unfinished, unreadable and unknown videos and repeated ids", async () => {
  const { client, batches } = stubYoutube({ a: "PT5M", husk: "P0D", bad: "nope" });
  const result = await fetchDurations(client, ["a", "a", "husk", "bad", "gone"]);
  assert.deepEqual([...result], [["a", 300]]);
  assert.deepEqual(batches, [["a", "husk", "bad", "gone"]]);
});

test("fetchDurations makes no call for no ids", async () => {
  const { client, batches } = stubYoutube({});
  assert.equal((await fetchDurations(client, [])).size, 0);
  assert.equal(batches.length, 0);
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
  jobsTable: typeof import("@workspace/db").jobsTable;
  backfill: typeof import("./durationBackfill").backfillMissingDurations;
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
    backfill: (await import("./durationBackfill")).backfillMissingDurations,
    eq: orm.eq,
    inArray: orm.inArray,
  };
});

after(async () => {
  if (skip || !m) return;
  if (created.length) await m.db.delete(m.jobsTable).where(m.inArray(m.jobsTable.id, created));
  await m.pool.end();
});

async function newJob(status: "done" | "pending", youtubeVideoId: string | null, durationSeconds: number | null) {
  const [row] = await m.db
    .insert(m.jobsTable)
    .values({ driveFileId: `test-${Date.now()}-${seq++}`, driveFileName: "x", status, youtubeVideoId, durationSeconds })
    .returning();
  created.push(row.id);
  return row;
}
const durationOf = async (id: number) => (await m.db.select().from(m.jobsTable).where(m.eq(m.jobsTable.id, id)))[0].durationSeconds;

test("database: backfill fills only done jobs that have a video and no length", { skip }, async () => {
  const missing = await newJob("done", "vMissing", null);
  const known = await newJob("done", "vKnown", 100);
  const noVideo = await newJob("done", null, null);
  const notDone = await newJob("pending", "vPending", null);
  const husk = await newJob("done", "vHusk", null);
  const { client, batches } = stubYoutube({ vMissing: "PT10M", vKnown: "PT99M", vPending: "PT1M", vHusk: "P0D" });

  const result = await m.backfill(client);

  assert.equal(await durationOf(missing.id), 600);
  assert.equal(await durationOf(known.id), 100, "a stored length is never overwritten");
  assert.equal(await durationOf(noVideo.id), null);
  assert.equal(await durationOf(notDone.id), null);
  assert.equal(await durationOf(husk.id), null);
  assert.ok(!batches.flat().includes("vKnown"), "a job that has a length is not asked about");
  assert.equal(result.updated, 1);
  assert.equal(result.unknown, 1, "the husk stays unknown");
});
