import { test } from "node:test";
import assert from "node:assert/strict";
import { runTeacherStep } from "./teacherStep";
import { readTeacherMode, teacherReadsPerTick, DEFAULT_READS_PER_TICK, MAX_READS_PER_TICK } from "./autoReviewMode";
import type { RunSummary } from "./teacherReads";

const summary = (attempted: number): RunSummary => ({ skipped: null, attempted, results: [] });

function spy(attempted = 2) {
  const calls = { reads: [] as number[], review: [] as string[] };
  return {
    calls,
    reads: async (n: number) => {
      calls.reads.push(n);
      return summary(attempted);
    },
    review: async (mode: string) => void calls.review.push(mode),
  };
}

// ── Modes ──────────────────────────────────────────────────────────────────

test("AUTO_REVIEW_TEACHER: only 'on' turns it on, anything else is off", () => {
  assert.equal(readTeacherMode("on"), "on");
  assert.equal(readTeacherMode(" ON "), "on");
  for (const v of [undefined, "", "off", "true", "1", "yes", "dry_run", "onn"]) assert.equal(readTeacherMode(v), "off", String(v));
});

test("TEACHER_READS_PER_TICK: 2 unless set, a whole number from 1 to 10", () => {
  assert.equal(teacherReadsPerTick(undefined), DEFAULT_READS_PER_TICK);
  assert.equal(teacherReadsPerTick(""), DEFAULT_READS_PER_TICK);
  assert.equal(teacherReadsPerTick("5"), 5);
  assert.equal(teacherReadsPerTick("1"), 1);
  assert.equal(teacherReadsPerTick("99"), MAX_READS_PER_TICK);
  for (const v of ["0", "-3", "2.5", "abc"]) assert.equal(teacherReadsPerTick(v), DEFAULT_READS_PER_TICK, v);
});

// ── The step at the end of a tick ──────────────────────────────────────────

test("off in every combination except dry run plus teacher on: nothing is read", async () => {
  for (const [reviewMode, teacherMode] of [["off", "off"], ["dry_run", "off"], ["off", "on"]] as const) {
    const s = spy();
    const r = await runTeacherStep({ reviewMode, teacherMode, reads: s.reads, review: s.review });
    assert.deepEqual(r, { ran: false, attempted: 0 }, `${reviewMode}/${teacherMode}`);
    assert.deepEqual(s.calls, { reads: [], review: [] });
  }
});

test("on: reads the bounded number, then runs the dry run again because something was read", async () => {
  const s = spy(2);
  const r = await runTeacherStep({ reviewMode: "dry_run", teacherMode: "on", limit: 3, reads: s.reads, review: s.review });
  assert.deepEqual(r, { ran: true, attempted: 2 });
  assert.deepEqual(s.calls, { reads: [3], review: ["dry_run"] });
});

test("on, but nothing was left to read: the dry run is not repeated", async () => {
  const s = spy(0);
  const r = await runTeacherStep({ reviewMode: "dry_run", teacherMode: "on", reads: s.reads, review: s.review });
  assert.deepEqual(r, { ran: true, attempted: 0 });
  assert.equal(s.calls.reads.length, 1);
  assert.deepEqual(s.calls.review, []);
});

test("a failing reader never throws out of the step, so it cannot stop the tick", async () => {
  const r = await runTeacherStep({
    reviewMode: "dry_run",
    teacherMode: "on",
    reads: async () => {
      throw new Error("ffmpeg is not installed");
    },
    review: async () => assert.fail("the dry run must not run after a failed read"),
  });
  assert.deepEqual(r, { ran: true, attempted: 0 });
});

test("a failing dry run after the reads never throws either", async () => {
  const r = await runTeacherStep({
    reviewMode: "dry_run",
    teacherMode: "on",
    reads: async () => summary(1),
    review: async () => {
      throw new Error("job_decisions table missing");
    },
  });
  assert.deepEqual(r, { ran: true, attempted: 0 });
});

test("the limit defaults to the setting when not given", async () => {
  const s = spy(1);
  const before = process.env.TEACHER_READS_PER_TICK;
  process.env.TEACHER_READS_PER_TICK = "4";
  try {
    await runTeacherStep({ reviewMode: "dry_run", teacherMode: "on", reads: s.reads, review: s.review });
  } finally {
    if (before === undefined) delete process.env.TEACHER_READS_PER_TICK;
    else process.env.TEACHER_READS_PER_TICK = before;
  }
  assert.deepEqual(s.calls.reads, [4]);
});
