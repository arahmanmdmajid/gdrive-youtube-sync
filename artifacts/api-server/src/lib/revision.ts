/**
 * A revision (or extra) class: a recording the reviewer marks by hand, usually of a subject whose slots have ended.
 * It keeps the subject's serial so it files under the subject, and it holds no timetable slot: its title ends
 * in "| Revision", which is never a slot's own title, so the day's other recordings keep their positions.
 */

/** "2.3 Siraji | Ustad Khalid Zaman" gives serial, subject and teacher; anything else gives null. */
export function parseLectureName(name: string): { serial: string; subjectEn: string; teacherEn: string } | null {
  const m = /^(\d+\.\d+)\s+(.+?)\s+\|\s+(.+)$/.exec(name.trim());
  return m ? { serial: m[1], subjectEn: m[2], teacherEn: m[3] } : null;
}

/** What every revision title of this lecture name on this day starts with. */
export function revisionBase(lectureName: string, dateStr: string): string {
  return `${lectureName} | ${dateStr} | Revision`;
}

/** `earlier` is how many other revisions of the same name and day already exist: the first has no number. */
export function revisionTitle(lectureName: string, dateStr: string, earlier: number): string {
  const base = revisionBase(lectureName, dateStr);
  return earlier === 0 ? base : `${base} ${earlier + 1}`;
}

/** The title and description a revision gets, whether it is marked in review or after it was uploaded. */
export function revisionPlan(lectureName: string, dateStr: string, fileName: string, earlier: number): { title: string; description: string } {
  return { title: revisionTitle(lectureName, dateStr, earlier), description: revisionDescription(lectureName, dateStr, fileName) };
}

/** Same lines as a timetable class's description, plus "Class: Revision". Kept free of `schedule.ts` so it needs no database. */
export function revisionDescription(lectureName: string, dateStr: string, fileName: string): string {
  const parsed = parseLectureName(lectureName);
  return [
    `Subject: ${parsed?.subjectEn ?? lectureName}`,
    `Teacher: ${parsed?.teacherEn ?? ""}`,
    `Date: ${dateStr}`,
    `Class: Revision`,
    `Source file: ${fileName}`,
    `Uploaded automatically by the class recording pipeline.`,
  ].join("\n");
}
