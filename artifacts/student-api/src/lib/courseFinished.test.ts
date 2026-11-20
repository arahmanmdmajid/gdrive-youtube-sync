import { test } from "node:test";
import assert from "node:assert/strict";
import { isCourseFinished } from "./courseFinished";

// `ends` is the end day (YYYY-MM-DD, last class day) of each timetable slot of one subject; null = no end.

test("a subject is finished once every slot has ended, from the day after the last class day", () => {
  assert.equal(isCourseFinished(["2026-11-16", "2026-11-16"], "2026-11-17"), true);
  assert.equal(isCourseFinished(["2026-11-16", "2026-11-16"], "2026-12-01"), true);
});

test("on the last class day the course is still running", () => {
  assert.equal(isCourseFinished(["2026-11-16"], "2026-11-16"), false);
  assert.equal(isCourseFinished(["2026-11-16"], "2026-11-15"), false);
});

test("one slot that has ended is enough, the other slots need no end day", () => {
  assert.equal(isCourseFinished(["2026-11-13", null], "2026-11-19"), true);
  assert.equal(isCourseFinished([null, "2026-11-13"], "2026-11-19"), true);
  assert.equal(isCourseFinished(["2026-11-13", "2026-12-20"], "2026-11-19"), true);
});

test("no slot with an end day, or only ends still ahead, keeps the subject running", () => {
  assert.equal(isCourseFinished([null, null], "2026-12-01"), false);
  assert.equal(isCourseFinished([null], "2026-12-01"), false);
  assert.equal(isCourseFinished(["2026-12-20", null], "2026-12-01"), false);
});

test("a subject with no timetable slot (audio-only, lecture names only) is never marked finished", () => {
  assert.equal(isCourseFinished([], "2026-12-01"), false);
});
