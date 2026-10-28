import type { ClassSlot } from "./schedule";

/**
 * A lecture name ("5.3 Subject | Teacher") that is not a timetable subject for the day, but whose
 * teacher has exactly one slot that day, is that teacher teaching something else in his slot.
 * `held` is the slot it takes; `as` is that slot relabelled with the name's serial, subject and
 * teacher, so `buildYoutubeTitleFromSlot(as, date)` gives the title. Anything else returns null.
 */
export function standInSlot(slots: ClassSlot[], lectureName: string): { held: ClassSlot; as: ClassSlot } | null {
  const m = /^(\d+\.\d+)\s+(.+?)\s+\|\s+(.+)$/.exec(lectureName.trim());
  if (!m) return null;
  const [, serial, subjectEn, teacherEn] = m;
  if (slots.some((s) => s.subjectEn === subjectEn)) return null;
  const own = slots.filter((s) => s.teacherEn === teacherEn);
  if (own.length !== 1) return null;
  return { held: own[0], as: { ...own[0], serial, subjectEn, teacherEn } };
}
