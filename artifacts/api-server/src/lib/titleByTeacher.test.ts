import { test } from "node:test";
import assert from "node:assert/strict";
import { proposeByTeacher, type TeacherRecording } from "./titleByTeacher";
import type { ClassSlot } from "./schedule";

const slot = (serial: string, subjectEn: string, teacherEn: string, timeSlot: string): ClassSlot =>
  ({ serial, subject: "", teacher: "", subjectEn, teacherEn, timeSlot });

// Monday: Ustad Haseeb has two slots, the others one each.
const monday = [
  slot("4.2", "Tawzeeh Part 2", "Ustad Saeedur Rahman", "18:00"),
  slot("1.2", "Jalalain Part 2", "Ustad Haseeb", "18:30"),
  slot("6.1", "Matan ul Kafi", "Ustad Aamir Iqbal", "19:00"),
  slot("2.1", "Al Fawz ul Kabir", "Ustad Haseeb", "20:00"),
];
const rec = (id: number, teacher: string | null, startMin: number | null = null, ambiguous = false): TeacherRecording =>
  ({ id, teacher, startMin, ambiguous });
const serials = (r: ReturnType<typeof proposeByTeacher>) => r.map((p) => `${p.slot?.serial ?? "-"}${p.part ? `.P${p.part}` : ""}`);

test("a teacher with one slot gets that subject, whatever the position in the day", () => {
  // Saeedur Rahman's class was skipped: Aamir Iqbal is first in the day but still gets 6.1.
  const r = proposeByTeacher(monday, [rec(1, "Ustad Aamir Iqbal"), rec(2, "Ustad Haseeb", 20 * 60)]);
  assert.equal(r[0].slot?.serial, "6.1");
  assert.equal(r[0].part, null);
  assert.equal(r[0].reason, null);
});

test("several recordings by a teacher with one slot become Part 1, Part 2 in order", () => {
  const r = proposeByTeacher(monday, [rec(1, "Ustad Saeedur Rahman"), rec(2, "Ustad Aamir Iqbal"), rec(3, "Ustad Saeedur Rahman")]);
  assert.deepEqual(serials(r), ["4.2.P1", "6.1", "4.2.P2"]);
});

test("two slots, one recording: the slot that starts nearest to it", () => {
  assert.equal(proposeByTeacher(monday, [rec(1, "Ustad Haseeb", 18 * 60 + 40)])[0].slot?.serial, "1.2");
  assert.equal(proposeByTeacher(monday, [rec(1, "Ustad Haseeb", 20 * 60 + 5)])[0].slot?.serial, "2.1");
});

test("two slots, two recordings: the slots in time order, no parts", () => {
  const r = proposeByTeacher(monday, [rec(1, "Ustad Haseeb", 18 * 60 + 30), rec(2, "Ustad Haseeb", 20 * 60)]);
  assert.deepEqual(serials(r), ["1.2", "2.1"]);
});

test("more recordings than the teacher has slots are left to a person", () => {
  const r = proposeByTeacher(monday, [rec(1, "Ustad Haseeb", 1100), rec(2, "Ustad Haseeb", 1150), rec(3, "Ustad Haseeb", 1200)]);
  assert.deepEqual(r.map((p) => p.reason), ["too_many", "too_many", "too_many"]);
  assert.ok(r.every((p) => p.slot === null));
});

test("no name, an ambiguous read, no slot that day and no start time are left to a person", () => {
  const r = proposeByTeacher(monday, [
    rec(1, null),
    rec(2, "Ustad Haseeb", 1200, true),
    rec(3, "Ustad Faraz"),
    rec(4, "Ustad Haseeb", null),
  ]);
  assert.deepEqual(r.map((p) => p.reason), ["no_name", "ambiguous", "no_slot", "no_start"]);
});

test("one proposal per recording, in the order given, and one teacher's recordings do not affect another's", () => {
  const input = [rec(7, "Ustad Aamir Iqbal"), rec(3, null), rec(9, "Ustad Saeedur Rahman")];
  const r = proposeByTeacher(monday, input);
  assert.deepEqual(r.map((p) => p.id), [7, 3, 9]);
  assert.deepEqual(serials(r), ["6.1", "-", "4.2"]);
});

test("no recordings gives no proposals", () => {
  assert.deepEqual(proposeByTeacher(monday, []), []);
});
