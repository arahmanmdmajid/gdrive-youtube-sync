import { test } from "node:test";
import assert from "node:assert/strict";
import { classDate, compareLectures } from "./lectureOrder";

type L = { id: number; title: string; driveCreatedTime: string | null };
const order = (lectures: L[]) => [...lectures].sort(compareLectures).map((l) => l.id);

test("the class date comes from the title, as YYYY-MM-DD", () => {
  assert.equal(classDate("1.1 Jalalain Part 1 | Ustad Fayyaz | 04-04-2026", null), "2026-04-04");
  assert.equal(classDate("1.1 Jalalain Part 1 | Ustad Fayyaz | 25-07-2026 | Part 2", null), "2026-07-25");
  assert.equal(classDate("2.3 Siraji | Ustad Khalid Zaman | 20-11-2026 | Revision", null), "2026-11-20");
});

test("a title with no date falls back to the PKT day of the recording", () => {
  // 20:00 UTC on the 24th is already the 25th in PKT.
  assert.equal(classDate("Some old title", "2026-07-24T20:00:00.000Z"), "2026-07-25");
  assert.equal(classDate("", "2026-07-24T10:00:00.000Z"), "2026-07-24");
});

test("a title with no date and no recording time has no class date", () => {
  assert.equal(classDate("Some old title", null), "");
});

test("a date that is not a real day in the title is ignored", () => {
  assert.equal(classDate("Book 99-99-2026", "2026-07-24T10:00:00.000Z"), "2026-07-24");
});

// Jobs 312 and 389 from the live data: 389 is the 04-04 class, added by hand on 30-07.
test("a backfilled older class is listed before a later class that was recorded earlier", () => {
  const lectures: L[] = [
    { id: 312, title: "1.1 Jalalain Part 1 | Ustad Fayyaz | 25-07-2026", driveCreatedTime: "2026-07-25T14:06:40.374Z" },
    { id: 389, title: "1.1 Jalalain Part 1 | Ustad Fayyaz | 04-04-2026", driveCreatedTime: "2026-07-30T08:54:03Z" },
  ];
  assert.deepEqual(order(lectures), [389, 312]);
});

// Jobs 318, 320 and 393 from subject 4.1: a chain, not just a pair.
test("a chain of out-of-order lectures ends up in date order", () => {
  const lectures: L[] = [
    { id: 318, title: "4.1 Tawzeeh Part 1 | Ustad Atiqullah | 25-07-2026", driveCreatedTime: "2026-07-25T15:00:00Z" },
    { id: 320, title: "4.1 Tawzeeh Part 1 | Ustad Atiqullah | 24-07-2026", driveCreatedTime: "2026-07-25T16:00:00Z" },
    { id: 393, title: "4.1 Tawzeeh Part 1 | Ustad Atiqullah | 10-04-2026", driveCreatedTime: "2026-07-30T09:30:00Z" },
  ];
  assert.deepEqual(order(lectures), [393, 320, 318]);
});

test("lectures of the same day keep their recording order, so Part 1 comes before Part 2", () => {
  const lectures: L[] = [
    { id: 2, title: "1.2 Jalalain Part 2 | Ustad Haseeb | 17-11-2026 | Part 2", driveCreatedTime: "2026-11-17T14:30:00Z" },
    { id: 1, title: "1.2 Jalalain Part 2 | Ustad Haseeb | 17-11-2026 | Part 1", driveCreatedTime: "2026-11-17T13:30:00Z" },
  ];
  assert.deepEqual(order(lectures), [1, 2]);
});

test("a lecture with a dateless title sorts by its recording day among the dated ones", () => {
  const lectures: L[] = [
    { id: 3, title: "1.1 Jalalain Part 1 | Ustad Fayyaz | 10-05-2026", driveCreatedTime: "2026-05-10T14:00:00Z" },
    { id: 1, title: "Old Arabic title", driveCreatedTime: "2026-04-01T14:00:00Z" },
    { id: 2, title: "1.1 Jalalain Part 1 | Ustad Fayyaz | 20-04-2026", driveCreatedTime: "2026-07-30T08:00:00Z" },
  ];
  assert.deepEqual(order(lectures), [1, 2, 3]);
});

test("lectures with the same day and time are ordered by id", () => {
  const t = "2026-07-30T08:00:00Z";
  const lectures: L[] = [
    { id: 9, title: "X | 01-01-2026", driveCreatedTime: t },
    { id: 4, title: "X | 01-01-2026", driveCreatedTime: t },
  ];
  assert.deepEqual(order(lectures), [4, 9]);
});
