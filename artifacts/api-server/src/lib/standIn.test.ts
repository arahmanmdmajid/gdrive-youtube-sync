import { test } from "node:test";
import assert from "node:assert/strict";
import { slotsHeldBy, standInSlot } from "./standIn";
import type { ClassSlot } from "./schedule";

const slot = (serial: string, subjectEn: string, teacherEn: string, timeSlot: string): ClassSlot =>
  ({ serial, subject: "", teacher: "", subjectEn, teacherEn, timeSlot });

const monday = [
  slot("1.2", "Jalalain Part 2", "Ustad Haseeb", "18:00"),
  slot("2.3", "Siraji", "Ustad Khalid Zaman", "19:30"),
  slot("2.1", "Al Fawz ul Kabir", "Ustad Haseeb", "20:00"),
];
const NAME = "5.3 Ulama-e-Deoband ka Deeni Rukh aur Maslaki Mizaj | Ustad Khalid Zaman";

test("a new subject by a teacher with one slot that day takes that slot", () => {
  const r = standInSlot(monday, NAME);
  assert.equal(r?.held.subjectEn, "Siraji");
  assert.equal(r?.as.serial, "5.3");
  assert.equal(r?.as.subjectEn, "Ulama-e-Deoband ka Deeni Rukh aur Maslaki Mizaj");
  assert.equal(r?.as.timeSlot, "19:30");
});

test("a subject that is in the day's timetable is not a stand-in", () => {
  assert.equal(standInSlot(monday, "2.3 Siraji | Ustad Khalid Zaman"), null);
});

test("a teacher with no slot, or with two slots, that day is not a stand-in", () => {
  assert.equal(standInSlot(monday, "5.3 Something | Ustad Nobody"), null);
  assert.equal(standInSlot(monday, "9.9 Something | Ustad Haseeb"), null);
});

test("a job titled as a stand-in holds the slot it took; others hold none", () => {
  const held = slotsHeldBy(monday, [
    "5.3 Ulama-e-Deoband ka Deeni Rukh aur Maslaki Mizaj | Ustad Khalid Zaman | 19-10-2026",
    "1.2 Jalalain Part 2 | Ustad Haseeb | 19-10-2026",
    null,
  ]);
  assert.deepEqual(held.map((s) => s.subjectEn), ["Siraji"]);
});

test("a name without serial, subject and teacher is not a stand-in", () => {
  assert.equal(standInSlot(monday, "Ustad Khalid Zaman"), null);
  assert.equal(standInSlot(monday, "5.3 Subject only"), null);
});
