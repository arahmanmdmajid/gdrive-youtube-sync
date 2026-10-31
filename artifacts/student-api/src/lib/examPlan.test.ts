import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  compareHours,
  daysBetween,
  isValidDaysPerWeek,
  isValidHoursPerDay,
  projectFinish,
  todayIn,
} from "./examPlan";

const HOUR = 3600;
const base = { hoursPerDay: 2, daysPerWeek: 7, today: "2026-10-31", examDate: "2027-01-01" };

test("date helpers cross month and year ends", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-10-31", 59), "2026-12-29");
  assert.equal(daysBetween("2026-10-31", "2027-01-01"), 62);
  assert.equal(daysBetween("2027-01-02", "2027-01-01"), -1);
});

test("today follows the given time zone", () => {
  const now = new Date("2026-10-31T20:00:00Z");
  assert.equal(todayIn("Asia/Karachi", now), "2026-11-01");
  assert.equal(todayIn("UTC", now), "2026-10-31");
});

test("hours per day must be above 0 and at most 24", () => {
  assert.equal(isValidHoursPerDay(0), false);
  assert.equal(isValidHoursPerDay(-1), false);
  assert.equal(isValidHoursPerDay(NaN), false);
  assert.equal(isValidHoursPerDay(24.5), false);
  assert.equal(isValidHoursPerDay(0.5), true);
  assert.equal(isValidHoursPerDay(24), true);
  assert.equal(isValidDaysPerWeek(0), false);
  assert.equal(isValidDaysPerWeek(1.5), false);
  assert.equal(isValidDaysPerWeek(8), false);
  assert.equal(isValidDaysPerWeek(7), true);
});

test("invalid input throws", () => {
  assert.throws(() => projectFinish({ ...base, remainingSeconds: HOUR, hoursPerDay: 0 }), RangeError);
  assert.throws(() => projectFinish({ ...base, remainingSeconds: HOUR, daysPerWeek: 8 }), RangeError);
});

test("nothing left means done, even after the exam", () => {
  assert.equal(projectFinish({ ...base, remainingSeconds: 0 }).status, "done");
  assert.equal(projectFinish({ ...base, remainingSeconds: 0, today: "2027-02-01" }).status, "done");
});

test("after the exam date there is no projection", () => {
  const p = projectFinish({ ...base, remainingSeconds: HOUR, today: "2027-01-02" });
  assert.equal(p.status, "exam_passed");
  assert.equal(p.finishDate, null);
  assert.equal(p.achievable, false);
});

test("on track with days to spare", () => {
  const p = projectFinish({ ...base, remainingSeconds: 120 * HOUR }); // 60 study days
  assert.equal(p.status, "on_track");
  assert.equal(p.studyDaysNeeded, 60);
  assert.equal(p.finishDate, "2026-12-29");
  assert.equal(p.daysSpare, 3);
  assert.equal(p.daysShort, null);
});

test("at risk by days short", () => {
  const p = projectFinish({ ...base, remainingSeconds: 130 * HOUR }); // 65 study days
  assert.equal(p.status, "at_risk");
  assert.equal(p.finishDate, "2027-01-03");
  assert.equal(p.daysShort, 2);
  assert.equal(p.daysSpare, null);
});

test("finishing on the exam day counts as on track", () => {
  const p = projectFinish({ ...base, remainingSeconds: 126 * HOUR }); // 63 study days
  assert.equal(p.finishDate, "2027-01-01");
  assert.equal(p.status, "on_track");
  assert.equal(p.daysSpare, 0);
});

test("a part of an hour still takes a whole study day", () => {
  const p = projectFinish({ ...base, remainingSeconds: 2 * HOUR + 1 });
  assert.equal(p.studyDaysNeeded, 2);
  assert.equal(p.finishDate, "2026-11-01");
});

test("fewer study days per week push the finish date out", () => {
  const p = projectFinish({ ...base, daysPerWeek: 5, remainingSeconds: 12 * HOUR }); // 6 study days
  assert.equal(p.finishDate, "2026-11-07");
  const one = projectFinish({ ...base, daysPerWeek: 1, remainingSeconds: 6 * HOUR }); // 3 study days
  assert.equal(one.finishDate, "2026-11-14");
});

test("minimum hours per day finishes exactly on time", () => {
  const p = projectFinish({ ...base, remainingSeconds: 120 * HOUR }); // 63 days available
  assert.equal(p.minHoursPerDay, 2);
  const again = projectFinish({ ...base, hoursPerDay: p.minHoursPerDay!, remainingSeconds: 120 * HOUR });
  assert.equal(again.status, "on_track");
});

test("minimum hours per day counts only the study days", () => {
  const p = projectFinish({ ...base, daysPerWeek: 5, remainingSeconds: 100 * HOUR });
  // 63 days = 9 weeks, so 45 study days
  assert.equal(p.minHoursPerDay, 2.3);
});

test("not achievable when even 24 hours a day is too little", () => {
  const p = projectFinish({ ...base, remainingSeconds: 2000 * HOUR });
  assert.equal(p.achievable, false);
  assert.equal(p.status, "at_risk");
});

test("on the exam day itself the whole load must fit in today", () => {
  const today = { ...base, today: "2027-01-01" };
  assert.equal(projectFinish({ ...today, remainingSeconds: 2 * HOUR }).status, "on_track");
  assert.equal(projectFinish({ ...today, remainingSeconds: 3 * HOUR }).status, "at_risk");
});

test("comparison table covers 1 to 4 hours", () => {
  const rows = compareHours({ remainingSeconds: 120 * HOUR, daysPerWeek: 7, today: base.today, examDate: base.examDate });
  assert.deepEqual(
    rows.map((r) => [r.hoursPerDay, r.status]),
    [[1, "at_risk"], [2, "on_track"], [3, "on_track"], [4, "on_track"]],
  );
  assert.equal(rows[1]!.finishDate, "2026-12-29");
});

test("comparison is empty when nothing is left", () => {
  assert.deepEqual(compareHours({ remainingSeconds: 0, daysPerWeek: 7, today: base.today, examDate: base.examDate }), []);
});
