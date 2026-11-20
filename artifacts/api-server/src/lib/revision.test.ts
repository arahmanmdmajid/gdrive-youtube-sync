import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLectureName, revisionBase, revisionTitle, revisionDescription } from "./revision";
import { slotTitleOf } from "./splitTitle";
import { slotsHeldBy } from "./standIn";
import type { ClassSlot } from "./schedule";

const siraji = "2.3 Siraji | Ustad Khalid Zaman";

test("a lecture name splits into serial, subject and teacher", () => {
  assert.deepEqual(parseLectureName(siraji), { serial: "2.3", subjectEn: "Siraji", teacherEn: "Ustad Khalid Zaman" });
  assert.deepEqual(parseLectureName("1.2 Jalalain Part 2 | Ustad Haseeb"), {
    serial: "1.2",
    subjectEn: "Jalalain Part 2",
    teacherEn: "Ustad Haseeb",
  });
});

test("a name that is not in the lecture name format is not parsed", () => {
  assert.equal(parseLectureName("Siraji"), null);
  assert.equal(parseLectureName("Siraji | Ustad Khalid Zaman"), null);
  assert.equal(parseLectureName(""), null);
});

test("the first revision of a name on a day has no number, later ones count on from 2", () => {
  assert.equal(revisionTitle(siraji, "20-11-2026", 0), "2.3 Siraji | Ustad Khalid Zaman | 20-11-2026 | Revision");
  assert.equal(revisionTitle(siraji, "20-11-2026", 1), "2.3 Siraji | Ustad Khalid Zaman | 20-11-2026 | Revision 2");
  assert.equal(revisionTitle(siraji, "20-11-2026", 2), "2.3 Siraji | Ustad Khalid Zaman | 20-11-2026 | Revision 3");
});

test("the base is what every revision title of that name and day starts with", () => {
  assert.equal(revisionBase(siraji, "20-11-2026"), "2.3 Siraji | Ustad Khalid Zaman | 20-11-2026 | Revision");
  assert.ok(revisionTitle(siraji, "20-11-2026", 3).startsWith(revisionBase(siraji, "20-11-2026")));
});

test("the description says it is a revision class", () => {
  const d = revisionDescription(siraji, "20-11-2026", "uys-vqbk-mnn (2026-11-20 17:31 GMT+5)");
  assert.match(d, /^Subject: Siraji$/m);
  assert.match(d, /^Teacher: Ustad Khalid Zaman$/m);
  assert.match(d, /^Date: 20-11-2026$/m);
  assert.match(d, /^Class: Revision$/m);
});

// A revision holds no timetable slot: its title must never read as the slot's own title, with or without a Part suffix.
test("a revision title is not read as a slot title, so it holds no slot", () => {
  const title = revisionTitle(siraji, "20-11-2026", 0);
  assert.equal(slotTitleOf(title), title);
  const slots: ClassSlot[] = [
    { serial: "2.3", subject: "", teacher: "", subjectEn: "Siraji", teacherEn: "Ustad Khalid Zaman", timeSlot: "19:30" },
    { serial: "5.1", subject: "", teacher: "", subjectEn: "Sharah Aqaid", teacherEn: "Ustad Khalid Zaman", timeSlot: "20:00" },
  ];
  assert.deepEqual(slotsHeldBy(slots, [slotTitleOf(title)]), []);
});
