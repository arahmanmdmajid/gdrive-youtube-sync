// Tests for upload recovery. YouTube is stubbed at its boundary (no real upload). The tests marked
// "database" need a real Postgres: set TEST_DATABASE_URL to a LOCAL database, as in jobClaims.test.ts.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  decideBeforeUpload,
  recordDone,
  retryUnrecorded,
  unrecordedJobIds,
  performUpload,
  UploadNotRecordedError,
} from "./uploadRecovery";
import { INCOMPLETE_UPLOAD_GRACE_MS } from "./youtubeMatch";

const NOW = Date.parse("2026-10-22T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;

type Item = { title: string; videoId: string; publishedAt: string; complete: boolean };

/** A stand-in for the YouTube client. `items` is what the channel holds; insert adds to it. */
function stubYoutube(opts: { items?: Item[]; lookupFails?: boolean; insertBehavior?: (n: number, items: Item[]) => void } = {}) {
  const items: Item[] = [...(opts.items ?? [])];
  const calls = { insert: 0 };
  const client = {
    channels: {
      list: async () => {
        if (opts.lookupFails) throw new Error("ECONNRESET while listing");
        return { data: { items: [{ contentDetails: { relatedPlaylists: { uploads: "UP" } } }] } };
      },
    },
    playlistItems: {
      list: async () => ({
        data: {
          items: items.map((i) => ({ snippet: { title: i.title, publishedAt: i.publishedAt, resourceId: { videoId: i.videoId } } })),
        },
      }),
    },
    videos: {
      list: async ({ id }: { id: string[] }) => {
        const i = items.find((x) => x.videoId === id[0]);
        return { data: { items: [{ status: { uploadStatus: i?.complete ? "processed" : "uploaded" }, contentDetails: { duration: i?.complete ? "PT25M" : "P0D" } }] } };
      },
      insert: async (req: { requestBody: { snippet: { title: string } } }) => {
        calls.insert++;
        opts.insertBehavior?.(calls.insert, items);
        const videoId = `vid${calls.insert}`;
        // YouTube now holds the video, still processing
        if (!items.some((x) => x.videoId === videoId)) {
          items.push({ title: req.requestBody.snippet.title, videoId, publishedAt: new Date(NOW).toISOString(), complete: false });
        }
        return { data: { id: videoId } };
      },
    },
  };
  return { client: client as never, calls, items };
}

const stream = async () => ({}) as never;
const fast = { insertRetryDelayMs: 1, recordOpts: { attempts: 3, baseDelayMs: 1 }, now: () => NOW };

// ── Pure decision ──────────────────────────────────────────────────────────

test("decideBeforeUpload: nothing, complete, young incomplete, old incomplete", () => {
  assert.equal(decideBeforeUpload(null, NOW), "upload");
  assert.equal(decideBeforeUpload({ videoId: "a", complete: true, publishedAt: ago(5 * MIN) }, NOW), "adopt");
  assert.equal(decideBeforeUpload({ videoId: "a", complete: false, publishedAt: ago(5 * MIN) }, NOW), "wait");
  assert.equal(decideBeforeUpload({ videoId: "a", complete: false, publishedAt: ago(INCOMPLETE_UPLOAD_GRACE_MS + MIN) }, NOW), "upload", "a husk is not waited for");
  assert.equal(decideBeforeUpload({ videoId: "a", complete: false, publishedAt: null }, NOW), "upload", "unknown age counts as a husk");
});

// ── Recording the upload ───────────────────────────────────────────────────

test("recordDone retries a failing write and succeeds", async () => {
  let n = 0;
  await recordDone(1001, "v1", "T", async () => { if (++n < 3) throw new Error("db down"); }, { attempts: 5, baseDelayMs: 1 });
  assert.equal(n, 3);
  assert.ok(!unrecordedJobIds().includes(1001));
});

test("recordDone that never succeeds keeps the video id and throws UploadNotRecordedError", async () => {
  await assert.rejects(
    () => recordDone(1002, "v-keep", "T", async () => { throw new Error("db down"); }, { attempts: 2, baseDelayMs: 1 }),
    (e: unknown) => e instanceof UploadNotRecordedError && e.videoId === "v-keep" && e.jobId === 1002,
  );
  assert.ok(unrecordedJobIds().includes(1002));
  const written: [number, string][] = [];
  const done = await retryUnrecorded(async (id, vid) => void written.push([id, vid]));
  assert.deepEqual(done.map((d) => d.jobId), [1002]);
  assert.deepEqual(written, [[1002, "v-keep"]]);
  assert.ok(!unrecordedJobIds().includes(1002));
});

// ── performUpload, YouTube stubbed ─────────────────────────────────────────

test("nothing on YouTube: uploads once and records it", async () => {
  const yt = stubYoutube();
  const written: string[] = [];
  const out = await performUpload({ id: 1, title: "T1", description: "d" }, { youtube: yt.client, openStream: stream, write: async (_i, v) => void written.push(v), ...fast });
  assert.equal(out.kind, "uploaded");
  assert.equal(yt.calls.insert, 1);
  assert.deepEqual(written, ["vid1"]);
});

test("a complete video with this title is adopted: no insert", async () => {
  const yt = stubYoutube({ items: [{ title: "T2", videoId: "old", publishedAt: ago(3 * 60 * MIN), complete: true }] });
  const written: string[] = [];
  const out = await performUpload({ id: 2, title: "T2", description: "d" }, { youtube: yt.client, openStream: stream, write: async (_i, v) => void written.push(v), ...fast });
  assert.deepEqual(out, { kind: "adopted", videoId: "old" });
  assert.equal(yt.calls.insert, 0);
  assert.deepEqual(written, ["old"]);
});

test("a same-titled upload still processing: waits, no insert, nothing recorded", async () => {
  const yt = stubYoutube({ items: [{ title: "T3", videoId: "young", publishedAt: ago(10 * MIN), complete: false }] });
  let wrote = 0;
  const out = await performUpload({ id: 3, title: "T3", description: "d" }, { youtube: yt.client, openStream: stream, write: async () => void wrote++, ...fast });
  assert.equal(out.kind, "waiting");
  assert.equal(yt.calls.insert, 0);
  assert.equal(wrote, 0);
});

test("a dead husk older than the grace period is not waited for: uploads again", async () => {
  const yt = stubYoutube({ items: [{ title: "T4", videoId: "husk", publishedAt: ago(5 * 60 * MIN), complete: false }] });
  const out = await performUpload({ id: 4, title: "T4", description: "d" }, { youtube: yt.client, openStream: stream, write: async () => {}, ...fast });
  assert.equal(out.kind, "uploaded");
  assert.equal(yt.calls.insert, 1);
});

test("a lookup that fails is never treated as 'not there': no insert, no write", async () => {
  const yt = stubYoutube({ lookupFails: true });
  let wrote = 0;
  await assert.rejects(() => performUpload({ id: 5, title: "T5", description: "d" }, { youtube: yt.client, openStream: stream, write: async () => void wrote++, ...fast }));
  assert.equal(yt.calls.insert, 0);
  assert.equal(wrote, 0);
});

test("database write fails after YouTube accepted the video: not failed, then a retry makes no second insert", async () => {
  const yt = stubYoutube();
  await assert.rejects(
    () => performUpload({ id: 6, title: "T6", description: "d" }, { youtube: yt.client, openStream: stream, write: async () => { throw new Error("db down"); }, ...fast }),
    (e: unknown) => e instanceof UploadNotRecordedError && e.videoId === "vid1",
  );
  assert.equal(yt.calls.insert, 1);
  assert.ok(unrecordedJobIds().includes(6), "the video id is kept");

  // the worker later retries the same job: YouTube already holds the video, still processing
  const again = await performUpload({ id: 6, title: "T6", description: "d" }, { youtube: yt.client, openStream: stream, write: async () => {}, ...fast });
  assert.equal(again.kind, "waiting");
  assert.equal(yt.calls.insert, 1, "no second upload");

  // and the saved id finishes the job
  const written: [number, string][] = [];
  await retryUnrecorded(async (id, v) => void written.push([id, v]));
  assert.deepEqual(written.filter(([id]) => id === 6), [[6, "vid1"]]);
});

test("transient insert error with nothing on YouTube yet: retries once the second look is empty", async () => {
  const yt = stubYoutube({ insertBehavior: (n) => { if (n === 1) throw new Error("ECONNRESET before the file was sent"); } });
  const written: string[] = [];
  const out = await performUpload({ id: 8, title: "T8", description: "d" }, { youtube: yt.client, openStream: stream, write: async (_i, v) => void written.push(v), ...fast });
  assert.equal(out.kind, "uploaded");
  assert.equal(yt.calls.insert, 2, "retried because the second look found nothing");
});

test("transient insert error but the video did arrive: the second look stops the retry", async () => {
  // insert 1 stores the video (as YouTube would) and then the connection drops
  const yt = stubYoutube({
    insertBehavior: (n, items) => {
      if (n === 1) {
        items.push({ title: "T9", videoId: "arrived", publishedAt: new Date(NOW).toISOString(), complete: false });
        throw new Error("ECONNRESET: response lost");
      }
    },
  });
  const out = await performUpload({ id: 9, title: "T9", description: "d" }, { youtube: yt.client, openStream: stream, write: async () => {}, ...fast });
  assert.equal(out.kind, "waiting");
  assert.equal(yt.calls.insert, 1, "the retry was not sent");
});

// ── database ────────────────────────────────────────────────────────────────

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
  reclaim: typeof import("./reclaim");
  eq: typeof import("drizzle-orm").eq;
  inArray: typeof import("drizzle-orm").inArray;
};
let m: Mods;
const created: number[] = [];
let seq = 0;

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = url;
  const dbMod = await import("@workspace/db");
  const orm = await import("drizzle-orm");
  m = { db: dbMod.db, pool: dbMod.pool, jobsTable: dbMod.jobsTable, claims: await import("./jobClaims"), reclaim: await import("./reclaim"), eq: orm.eq, inArray: orm.inArray };
});

after(async () => {
  if (skip || !m) return;
  if (created.length) await m.db.delete(m.jobsTable).where(m.inArray(m.jobsTable.id, created));
  await m.pool.end();
});

async function newJob(status: "processing" | "pending" | "failed", updatedAt = new Date()) {
  const [row] = await m.db
    .insert(m.jobsTable)
    .values({ driveFileId: `rec-${Date.now()}-${seq++}`, driveFileName: "x", status, proposedTitle: `Rec title ${seq}`, updatedAt })
    .returning();
  created.push(row.id);
  return row;
}
const getJob = async (id: number) => (await m.db.select().from(m.jobsTable).where(m.eq(m.jobsTable.id, id)))[0];

test("database: after a failed write the job stays processing, and the saved video id finishes it", { skip }, async () => {
  const job = await newJob("processing");
  await m.db.update(m.jobsTable).set({ errorMessage: "old error" }).where(m.eq(m.jobsTable.id, job.id));
  await assert.rejects(() => recordDone(job.id, "vid-db", "T", async () => { throw new Error("connection reset"); }, { attempts: 2, baseDelayMs: 1 }));
  assert.equal((await getJob(job.id)).status, "processing", "not failed");

  const done = await retryUnrecorded(m.claims.markJobDone);
  assert.ok(done.some((d) => d.jobId === job.id));
  const after = await getJob(job.id);
  assert.equal(after.status, "done");
  assert.equal(after.youtubeVideoId, "vid-db");
  assert.equal(after.youtubeUrl, "https://www.youtube.com/watch?v=vid-db");
  assert.equal(after.errorMessage, null, "the stale error is cleared on success");
});

test("database: the sweep leaves a job alone when YouTube cannot be asked, instead of requeueing it for a second upload", { skip }, async () => {
  const old = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const stranded = await newJob("processing", old);
  await m.reclaim.reclaimOrphanedJobs({ minAgeMs: 15 * MIN }); // no YouTube credentials in the test: the lookup fails
  assert.equal((await getJob(stranded.id)).status, "processing", "still processing, not requeued as pending");
});

test("database: the sweep skips excluded and too-recent jobs", { skip }, async () => {
  const old = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const excluded = await newJob("processing", old);
  const recent = await newJob("processing", new Date());
  const res = await m.reclaim.reclaimOrphanedJobs({ excludeIds: [excluded.id], minAgeMs: 15 * MIN });
  assert.equal((await getJob(excluded.id)).status, "processing");
  assert.equal((await getJob(recent.id)).status, "processing");
  assert.equal(res.requeued + res.recovered, 0);
});
