import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTeacherAgreement, teacherOfTitle, type TeacherAgreementJob, type TeacherAgreementRead } from "./teacherAgreement";

const H = "hash-now";

const job = (id: number, status: string, finalTitle: string | null): TeacherAgreementJob => ({ id, status, finalTitle });
const read = (jobId: number, teacher: string | null, over: Partial<TeacherAgreementRead> = {}): TeacherAgreementRead => ({
  jobId,
  status: "ok",
  teacher,
  aliasHash: H,
  ...over,
});

test("teacherOfTitle takes the second part of the title", () => {
  assert.equal(teacherOfTitle("1.2 Jalalain Part 2 | Ustad Haseeb | 18-05-2026"), "Ustad Haseeb");
  assert.equal(teacherOfTitle("1.2 Jalalain Part 2 | Ustad Haseeb | 18-05-2026 | Part 2"), "Ustad Haseeb");
  assert.equal(teacherOfTitle("2.3 Siraji | Ustad Khalid Zaman | 17-11-2026 | Revision"), "Ustad Khalid Zaman");
  assert.equal(teacherOfTitle("no pipes here"), null);
  assert.equal(teacherOfTitle(null), null);
});

test("a job that left review agrees when the title names the teacher the read found", () => {
  const r = computeTeacherAgreement([job(1, "done", "2.3 Siraji | Ustad Khalid Zaman | 10-11-2026")], [read(1, "Ustad Khalid Zaman")], H);
  assert.equal(r.agree, 1);
  assert.equal(r.disagree, 0);
  assert.deepEqual(r.disagreements, []);
});

test("a different teacher in the title is a disagreement, listed by job id", () => {
  const r = computeTeacherAgreement(
    [job(7, "done", "5.2 Falakiyat | Ustad Haseeb | 10-11-2026"), job(3, "pending", "1.1 Jalalain Part 1 | Ustad Fayyaz | 10-11-2026")],
    [read(7, "Ustad Khalid Zaman"), read(3, "Ustad Haseeb")],
    H,
  );
  assert.equal(r.agree, 0);
  assert.equal(r.disagree, 2);
  assert.deepEqual(r.disagreements.map((d) => d.jobId), [3, 7]);
  assert.deepEqual(r.disagreements[1], { jobId: 7, teacher: "Ustad Khalid Zaman", title: "5.2 Falakiyat | Ustad Haseeb | 10-11-2026" });
});

test("case and spacing do not matter", () => {
  const r = computeTeacherAgreement([job(1, "done", "2.3 Siraji |  ustad haseeb  | 10-11-2026")], [read(1, "Ustad Haseeb")], H);
  assert.equal(r.agree, 1);
});

test("no verdict: failed read, nobody identified, read with an older alias table", () => {
  const r = computeTeacherAgreement(
    [job(1, "done", "a | Ustad Haseeb | d"), job(2, "done", "a | Ustad Haseeb | d"), job(3, "done", "a | Ustad Haseeb | d")],
    [read(1, "Ustad Haseeb", { status: "failed" }), read(2, null), read(3, "Ustad Haseeb", { aliasHash: "old" })],
    H,
  );
  assert.equal(r.noVerdict, 3);
  assert.equal(r.agree + r.disagree, 0);
});

test("no read at all is counted as not read", () => {
  const r = computeTeacherAgreement([job(1, "done", "a | Ustad Haseeb | d")], [], H);
  assert.equal(r.jobsLeftReview, 1);
  assert.equal(r.notRead, 1);
});

test("with no alias table every read is out of date", () => {
  const r = computeTeacherAgreement([job(1, "done", "a | Ustad Haseeb | d")], [read(1, "Ustad Haseeb")], null);
  assert.equal(r.noVerdict, 1);
  assert.equal(r.agree, 0);
});

test("jobs in review and rejected jobs are not compared", () => {
  const r = computeTeacherAgreement(
    [job(1, "needs_review", "a | Ustad Haseeb | d"), job(2, "rejected", "a | Ustad Haseeb | d")],
    [read(1, "Ustad Haseeb"), read(2, "Ustad Haseeb")],
    H,
  );
  assert.equal(r.jobsLeftReview, 0);
  assert.equal(r.agree, 0);
});

test("every status after review counts", () => {
  const statuses = ["pending", "processing", "done", "failed", "removed"];
  const jobs = statuses.map((s, i) => job(i + 1, s, "a | Ustad Haseeb | d"));
  const reads = statuses.map((_, i) => read(i + 1, "Ustad Haseeb"));
  assert.equal(computeTeacherAgreement(jobs, reads, H).agree, 5);
});

test("split by the teacher the read found", () => {
  const r = computeTeacherAgreement(
    [job(1, "done", "a | Ustad Haseeb | d"), job(2, "done", "a | Ustad Fayyaz | d"), job(3, "done", "a | Ustad Fayyaz | d")],
    [read(1, "Ustad Haseeb"), read(2, "Ustad Haseeb"), read(3, "Ustad Fayyaz")],
    H,
  );
  assert.deepEqual(r.byTeacher, [
    { teacher: "Ustad Fayyaz", agree: 1, disagree: 0 },
    { teacher: "Ustad Haseeb", agree: 1, disagree: 1 },
  ]);
});

test("a job with no teacher in its title disagrees", () => {
  const r = computeTeacherAgreement([job(1, "failed", null)], [read(1, "Ustad Haseeb")], H);
  assert.equal(r.disagree, 1);
  assert.equal(r.disagreements[0].title, "");
});

test("empty input", () => {
  const r = computeTeacherAgreement([], [], H);
  assert.deepEqual(r, { jobsLeftReview: 0, notRead: 0, noVerdict: 0, agree: 0, disagree: 0, byTeacher: [], disagreements: [] });
});
