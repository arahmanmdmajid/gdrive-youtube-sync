import { test } from "node:test";
import assert from "node:assert/strict";
import { computeScreenAgreement, type ScreenAgreementJob, type ScreenAgreementRead } from "./screenAgreement";
import { SCREEN_TABLE_VERSION } from "./screenSubject";

const V = SCREEN_TABLE_VERSION;

const job = (id: number, status: string, finalTitle: string | null): ScreenAgreementJob => ({ id, status, finalTitle });
const read = (jobId: number, subject: string | null, serials: string[], over: Partial<ScreenAgreementRead> = {}): ScreenAgreementRead => ({
  jobId,
  status: "ok",
  subject,
  serials,
  tableVersion: V,
  ...over,
});

test("a job that left review agrees when the title's serial is one the screen allows", () => {
  const r = computeScreenAgreement(
    [job(1, "done", "2.3 Siraji | Ustad Khalid Zaman | 10-11-2026")],
    [read(1, "Siraji", ["2.3"])],
  );
  assert.equal(r.agree, 1);
  assert.equal(r.disagree, 0);
  assert.deepEqual(r.disagreements, []);
});

test("a title with a serial the screen does not allow is a disagreement, listed by job id", () => {
  const r = computeScreenAgreement(
    [job(7, "done", "5.2 Falakiyat | Ustad Khalid Zaman | 10-11-2026"), job(3, "done", "1.1 Jalalain Part 1 | Ustad Fayyaz | 10-11-2026")],
    [read(7, "Sharah Aqaid", ["5.1"]), read(3, "Siraji", ["2.3"])],
  );
  assert.equal(r.agree, 0);
  assert.equal(r.disagree, 2);
  assert.deepEqual(
    r.disagreements.map((d) => d.jobId),
    [3, 7],
  );
  assert.deepEqual(r.disagreements[1], { jobId: 7, subject: "Sharah Aqaid", serials: ["5.1"], title: "5.2 Falakiyat | Ustad Khalid Zaman | 10-11-2026" });
});

test("a Jalalain volume mismatch is a disagreement", () => {
  const r = computeScreenAgreement([job(1, "done", "1.3 Jalalain Part 3 | Ustad Wasimullah | 10-11-2026")], [read(1, "Jalalain", ["1.2"])]);
  assert.equal(r.disagree, 1);
});

test("a read with no usable verdict is counted as no verdict, not as agree or disagree", () => {
  const jobs = [1, 2, 3, 4].map((id) => job(id, "done", "2.3 Siraji | Ustad Khalid Zaman | 10-11-2026"));
  const r = computeScreenAgreement(jobs, [
    read(1, null, []), // no book was seen
    read(2, "Siraji", ["2.3"], { status: "failed" }),
    read(3, "Siraji", ["2.3"], { tableVersion: V - 1 }), // made with an older subject table
    read(4, null, [], { status: "ok" }),
  ]);
  assert.equal(r.noVerdict, 4);
  assert.equal(r.agree + r.disagree, 0);
});

test("a job that left review with no read at all is counted as not read", () => {
  const r = computeScreenAgreement([job(1, "done", "2.3 Siraji | Ustad Khalid Zaman | 10-11-2026")], []);
  assert.equal(r.notRead, 1);
  assert.equal(r.jobsLeftReview, 1);
});

test("jobs still in review, and rejected ones, are not compared", () => {
  const r = computeScreenAgreement(
    [job(1, "needs_review", "2.3 Siraji | X | 10-11-2026"), job(2, "rejected", "2.3 Siraji | X | 10-11-2026")],
    [read(1, "Siraji", ["2.3"]), read(2, "Sharah Aqaid", ["5.1"])],
  );
  assert.equal(r.jobsLeftReview, 0);
  assert.equal(r.agree + r.disagree + r.noVerdict + r.notRead, 0);
});

test("every status after review counts as having left it", () => {
  const jobs = ["pending", "processing", "done", "failed", "removed"].map((s, i) => job(i + 1, s, "2.3 Siraji | X | 10-11-2026"));
  const r = computeScreenAgreement(jobs, jobs.map((j) => read(j.id, "Siraji", ["2.3"])));
  assert.equal(r.jobsLeftReview, 5);
  assert.equal(r.agree, 5);
});

test("the split by subject counts agreement and disagreement per subject, sorted by subject", () => {
  const r = computeScreenAgreement(
    [
      job(1, "done", "2.3 Siraji | X | 10-11-2026"),
      job(2, "done", "2.3 Siraji | X | 17-11-2026"),
      job(3, "done", "5.1 Sharah Aqaid | X | 10-11-2026"),
      job(4, "done", "5.2 Falakiyat | X | 10-11-2026"),
    ],
    [read(1, "Siraji", ["2.3"]), read(2, "Siraji", ["2.3"]), read(3, "Sharah Aqaid", ["5.1"]), read(4, "Sharah Aqaid", ["5.1"])],
  );
  assert.deepEqual(r.bySubject, [
    { subject: "Sharah Aqaid", agree: 1, disagree: 1 },
    { subject: "Siraji", agree: 2, disagree: 0 },
  ]);
});

test("a job with no title cannot agree", () => {
  const r = computeScreenAgreement([job(1, "done", null)], [read(1, "Siraji", ["2.3"])]);
  assert.equal(r.disagree, 1);
  assert.equal(r.disagreements[0]!.title, "");
});

test("an empty input gives an empty report", () => {
  const r = computeScreenAgreement([], []);
  assert.deepEqual(r, { tableVersion: V, jobsLeftReview: 0, notRead: 0, noVerdict: 0, agree: 0, disagree: 0, bySubject: [], disagreements: [] });
});
