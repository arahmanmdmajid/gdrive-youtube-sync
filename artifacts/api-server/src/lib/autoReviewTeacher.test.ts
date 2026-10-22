// How the rules use the teacher seen on screen (see teacherTile.ts and issue #42).
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateGroup, type GroupInput, type CheckId } from "./autoReview";
import { cleanDay, buildDay } from "./autoReview.fixtures";

const checks = (input: GroupInput) => [...new Set(evaluateGroup(input).reasons.map((r) => r.check))].sort() as CheckId[];
const copy = (d: GroupInput): GroupInput => structuredClone(d);

// Lengths in minutes per lecture, as in autoReview.test.ts.
const UNIQUE_SPLIT = [[27], [50], [10, 17], [50], [30], [26]]; // neighbours of the broken lecture are too long to join
const AMBIGUOUS_SPLIT = [[27], [26], [10, 17], [28], [27], [26]]; // the break could belong to several places
const SHORT_FRAGMENT = [[27], [50], [10, 17], [50], [30], [26, 2]];

const teacherOfSlot = (s: { title: string }) => s.title.split(" | ")[1];

/** The same day with each slot's teacher set and each recording showing the teacher of the lecture it really belongs to. */
function withTeachers(day: GroupInput, lectures: number[][]): GroupInput {
  const d = copy(day);
  d.slots = d.slots.map((s) => ({ ...s, teacher: teacherOfSlot(s) }));
  let k = 0;
  lectures.forEach((parts, i) =>
    parts.forEach(() => {
      d.files[k++].teacher = d.slots[i].teacher;
    }),
  );
  return d;
}

test("the clean day's slots have different teachers next to each other (what the evidence relies on)", () => {
  const t = cleanDay.slots.map(teacherOfSlot);
  for (let i = 1; i < t.length; i++) assert.notEqual(t[i], t[i - 1]);
});

test("without teacher evidence the verdicts are exactly those without it, even when slots carry teachers", () => {
  const d = buildDay(AMBIGUOUS_SPLIT);
  const plain = evaluateGroup(d);
  const slotTeachersOnly = evaluateGroup({ ...copy(d), slots: d.slots.map((s) => ({ ...s, teacher: teacherOfSlot(s) })) });
  assert.deepEqual(slotTeachersOnly.reasons, plain.reasons);
  assert.deepEqual(plain.teacherEvidence, { identified: 0, of: 7, consistentSplits: null, resolvedAmbiguity: false });
  assert.equal(plain.verdict, "hold");
});

test("every recording identified: a day that was ambiguous by length resolves to one grouping", () => {
  const d = withTeachers(buildDay(AMBIGUOUS_SPLIT), AMBIGUOUS_SPLIT);
  const v = evaluateGroup(d);
  assert.ok(v.splitCount! > 1, "ambiguous by length alone");
  assert.equal(v.verdict, "clean", JSON.stringify(v.reasons));
  assert.deepEqual(v.teacherEvidence, { identified: 7, of: 7, consistentSplits: 1, resolvedAmbiguity: true });
  assert.deepEqual(v.lectures.map((l) => l.jobIds.length), [1, 1, 2, 1, 1, 1]);
  assert.deepEqual(v.lectures[2].jobIds, [3, 4]);
  assert.equal(v.lectures[2].titles[1].title, d.slots[2].title + " | Part 2");
});

test("only some recordings identified: the evidence cannot resolve the ambiguity", () => {
  const d = withTeachers(buildDay(AMBIGUOUS_SPLIT), AMBIGUOUS_SPLIT);
  d.files[4].teacher = undefined; // never read
  const v = evaluateGroup(d);
  assert.ok(checks(d).includes("ambiguous_split"));
  assert.equal(v.teacherEvidence.resolvedAmbiguity, false);
  assert.equal(v.teacherEvidence.identified, 6);
});

test("a reading that found nobody (null) counts as not identified, like no reading", () => {
  const d = withTeachers(buildDay(AMBIGUOUS_SPLIT), AMBIGUOUS_SPLIT);
  d.files[4].teacher = null;
  assert.ok(checks(d).includes("ambiguous_split"));
  assert.equal(evaluateGroup(d).teacherEvidence.identified, 6);
});

test("a teacher that disagrees with the one grouping the lengths give holds as a mismatch", () => {
  const d = withTeachers(buildDay(UNIQUE_SPLIT), UNIQUE_SPLIT);
  assert.equal(evaluateGroup(d).verdict, "clean", "agrees: clean");
  d.files[4].teacher = d.slots[0].teacher; // recording 5 shows the first slot's teacher
  const v = evaluateGroup(d);
  assert.equal(v.verdict, "hold");
  const r = v.reasons.find((x) => x.check === "teacher_mismatch")!;
  assert.deepEqual(r.jobIds, [5]);
  assert.deepEqual(v.lectures, [], "no grouping is offered");
});

test("teachers that fit none of the length-valid groupings hold as a mismatch", () => {
  const d = withTeachers(buildDay(AMBIGUOUS_SPLIT), AMBIGUOUS_SPLIT);
  d.files.forEach((f) => (f.teacher = d.slots[0].teacher)); // the same teacher in every recording
  const v = evaluateGroup(d);
  assert.ok(v.reasons.some((x) => x.check === "teacher_mismatch" && x.jobIds.length === 0));
  assert.ok(!checks(d).includes("ambiguous_split"));
  assert.equal(v.teacherEvidence.consistentSplits, 0);
});

test("a swapped teacher on a recording that is alone in its lecture holds", () => {
  const d = withTeachers(buildDay([[27], [26], [28], [27], [30], [26]]), [[27], [26], [28], [27], [30], [26]]);
  assert.equal(evaluateGroup(d).verdict, "clean");
  d.files[1].teacher = d.slots[3].teacher; // slots 2 and 4 were swapped on the day
  const v = evaluateGroup(d);
  assert.ok(v.reasons.some((r) => r.check === "teacher_mismatch" && r.jobIds.includes(2)));
});

test("two adjacent slots with the same teacher cannot be separated: still ambiguous", () => {
  const d = withTeachers(buildDay(AMBIGUOUS_SPLIT), AMBIGUOUS_SPLIT);
  d.slots[3] = { ...d.slots[3], teacher: d.slots[2].teacher }; // lectures 3 and 4 share a teacher
  d.files[4].teacher = d.slots[2].teacher; // and the recording of lecture 4 shows that teacher
  const v = evaluateGroup(d);
  assert.ok(checks(d).includes("ambiguous_split"));
  assert.match(v.reasons.find((r) => r.check === "ambiguous_split")!.message, /even after using the teachers/);
  assert.ok(v.teacherEvidence.consistentSplits! >= 2);
});

test("evidence is ignored when the schedule has no teacher for its slots", () => {
  const d = buildDay(AMBIGUOUS_SPLIT); // slots without a teacher
  d.files.forEach((f) => (f.teacher = "Ustad Anyone"));
  const v = evaluateGroup(d);
  assert.deepEqual(checks(d), ["ambiguous_split"]);
  assert.equal(v.teacherEvidence.consistentSplits, null);
});

test("evidence that agrees with a grouping the lengths already fix changes nothing but is reported", () => {
  const d = withTeachers(buildDay(UNIQUE_SPLIT), UNIQUE_SPLIT);
  const v = evaluateGroup(d);
  assert.equal(v.verdict, "clean");
  assert.deepEqual(v.teacherEvidence, { identified: 7, of: 7, consistentSplits: 1, resolvedAmbiguity: false });
});

test("a short recording still holds the day and the teacher does not settle it", () => {
  const d = withTeachers(buildDay(SHORT_FRAGMENT), SHORT_FRAGMENT);
  assert.deepEqual(checks(d), ["short_recording"]);
});
