import { test } from "node:test";
import assert from "node:assert/strict";
import { diffSnapshots, type JobSnap } from "./decisionDiff.ts";

const job = (id: number, title: string | null, status = "needs_review", confirmed = false): JobSnap => ({
  id,
  proposedTitle: title,
  status,
  lectureNameConfirmed: confirmed,
});
const snap = (...jobs: JobSnap[]) => new Map(jobs.map((j) => [j.id, j]));

test("no change gives no rows", () => {
  const s = snap(job(1, "A"), job(2, "B"));
  assert.deepEqual(diffSnapshots(s, s, 1, "cascade"), []);
});

test("approve records the status change on the subject only", () => {
  const rows = diffSnapshots(snap(job(1, "A")), snap(job(1, "A", "pending")), 1, "cascade");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].role, "subject");
  assert.equal(rows[0].fromStatus, "needs_review");
  assert.equal(rows[0].toStatus, "pending");
  assert.equal(rows[0].detail, null);
});

test("a cascade records the subject and every shifted sibling with old and new titles", () => {
  const before = snap(job(1, "S1"), job(2, "S2"), job(3, "S3"));
  const after = snap(job(1, "S2", "pending", true), job(2, "S3"), job(3, "S4"));
  const rows = diffSnapshots(before, after, 1, "cascade");
  assert.equal(rows.length, 3);
  const byId = new Map(rows.map((r) => [r.jobId, r]));
  assert.equal(byId.get(1)?.role, "subject");
  assert.equal(byId.get(2)?.role, "affected");
  assert.equal(byId.get(2)?.detail, "cascade");
  assert.equal(byId.get(2)?.fromTitle, "S2");
  assert.equal(byId.get(2)?.toTitle, "S3");
  assert.equal(byId.get(1)?.fromConfirmed, false);
  assert.equal(byId.get(1)?.toConfirmed, true);
});

test("a swap records both jobs and labels the other one as swap", () => {
  const before = snap(job(1, "X"), job(2, "Y"));
  const after = snap(job(1, "Y", "pending", true), job(2, "X"));
  const rows = diffSnapshots(before, after, 1, "swap");
  assert.equal(rows.find((r) => r.jobId === 2)?.detail, "swap");
  assert.equal(rows.find((r) => r.jobId === 2)?.toTitle, "X");
});

test("a new job has null from fields", () => {
  const rows = diffSnapshots(snap(), snap(job(5, "New")), null, null);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].fromTitle, null);
  assert.equal(rows[0].fromStatus, null);
  assert.equal(rows[0].toTitle, "New");
});

test("a deleted job is skipped", () => {
  assert.deepEqual(diffSnapshots(snap(job(1, "A")), snap(), 1, null), []);
});

test("scan mode ignores upload status changes but keeps title changes and new jobs", () => {
  const before = snap(job(1, "A", "pending"), job(2, "B"));
  const after = snap(job(1, "A", "processing"), job(2, "B2"), job(3, "C"));
  const rows = diffSnapshots(before, after, null, null, true);
  assert.deepEqual(rows.map((r) => r.jobId).sort(), [2, 3]);
});

test("history is not overwritten: two successive changes give two diffs", () => {
  const a = snap(job(1, "T1"));
  const b = snap(job(1, "T2"));
  const c = snap(job(1, "T3"));
  const first = diffSnapshots(a, b, 1, null);
  const second = diffSnapshots(b, c, 1, null);
  assert.equal(first[0].fromTitle, "T1");
  assert.equal(second[0].fromTitle, "T2");
});
