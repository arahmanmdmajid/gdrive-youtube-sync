import { UNGROUPED_SERIAL, serialForTitle, type SubjectLookup } from "./subjectSerial";

export interface GroupableLecture {
  id: number;
  title: string;
  /** A revision or extra class is listed under its subject but not counted in any total. */
  classKind: "regular" | "revision";
  driveCreatedTime: string | null;
}

/**
 * One entry per subject that has a lecture, with how many lectures it has and how many the student completed or
 * started. A revision class puts its subject in the list but adds to no count.
 */
export function groupBySubject(lectures: GroupableLecture[], progress: Map<number, string>, lookup: SubjectLookup) {
  const groups = new Map<string, { total: number; completed: number; inProgress: number; latest: string | null }>();
  for (const lecture of lectures) {
    const serial = serialForTitle(lecture.title, lookup);
    const group = groups.get(serial) ?? { total: 0, completed: 0, inProgress: 0, latest: null };
    groups.set(serial, group);
    if (lecture.classKind === "revision") continue;
    group.total += 1;
    const status = progress.get(lecture.id);
    if (status === "completed") group.completed += 1;
    else if (status === "in_progress") group.inProgress += 1;
    if (!group.latest || (lecture.driveCreatedTime ?? "") > group.latest) {
      group.latest = lecture.driveCreatedTime;
    }
  }

  const subjects = lookup.subjects.filter((s) => groups.has(s.serial)).map((s) => ({
    ...s,
    ...groups.get(s.serial)!,
  }));
  const ungrouped = groups.get(UNGROUPED_SERIAL);
  if (ungrouped) {
    subjects.push({
      serial: UNGROUPED_SERIAL,
      nameEn: "Earlier lectures",
      teacherEn: "",
      finished: false,
      ...ungrouped,
    });
  }
  return subjects;
}
