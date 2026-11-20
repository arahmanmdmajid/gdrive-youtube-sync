import { test } from "node:test";
import assert from "node:assert/strict";
import { groupBySubject, type GroupableLecture } from "./groupBySubject";
import type { SubjectLookup } from "./subjectSerial";

const lookup: SubjectLookup = {
  subjects: [{ serial: "2.3", nameEn: "Siraji", teacherEn: "Ustad Khalid Zaman", finished: true }],
  serials: new Set(["2.3"]),
  arabicSerialMap: {},
};

function lecture(id: number, title: string, classKind: "regular" | "revision", day: string): GroupableLecture {
  return { id, title, classKind, driveCreatedTime: `2026-11-${day}T12:00:00.000Z` };
}

test("a revision class is not counted in a subject's total, completed or in-progress", () => {
  const lectures = [
    lecture(1, "2.3 Siraji | Ustad Khalid Zaman | 10-11-2026", "regular", "10"),
    lecture(2, "2.3 Siraji | Ustad Khalid Zaman | 17-11-2026", "regular", "17"),
    lecture(3, "2.3 Siraji | Ustad Khalid Zaman | 20-11-2026 | Revision", "revision", "20"),
  ];
  const progress = new Map([
    [1, "completed"],
    [2, "in_progress"],
    [3, "completed"],
  ]);
  const [siraji] = groupBySubject(lectures, progress, lookup);
  assert.equal(siraji!.total, 2);
  assert.equal(siraji!.completed, 1);
  assert.equal(siraji!.inProgress, 1);
  assert.equal(siraji!.latest, "2026-11-17T12:00:00.000Z");
});

test("a subject with only a revision class still appears, with nothing counted", () => {
  const lectures = [lecture(3, "2.3 Siraji | Ustad Khalid Zaman | 20-11-2026 | Revision", "revision", "20")];
  const subjects = groupBySubject(lectures, new Map([[3, "completed"]]), lookup);
  assert.equal(subjects.length, 1);
  assert.equal(subjects[0]!.serial, "2.3");
  assert.equal(subjects[0]!.total, 0);
  assert.equal(subjects[0]!.completed, 0);
});

test("regular lectures are counted as before", () => {
  const lectures = [
    lecture(1, "2.3 Siraji | Ustad Khalid Zaman | 10-11-2026", "regular", "10"),
    lecture(2, "Some old title", "regular", "05"),
  ];
  const subjects = groupBySubject(lectures, new Map([[1, "completed"]]), lookup);
  const siraji = subjects.find((s) => s.serial === "2.3")!;
  assert.equal(siraji.total, 1);
  assert.equal(siraji.completed, 1);
  const other = subjects.find((s) => s.serial === "other")!;
  assert.equal(other.total, 1);
  assert.equal(other.nameEn, "Earlier lectures");
});
