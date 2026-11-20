// The pure part of the subject lookup: types and the title-to-serial rule. Kept apart from subjects.ts, which reads the
// database, so grouping can be tested without one.

export interface SubjectInfo {
  serial: string;
  nameEn: string;
  teacherEn: string;
  /** The course has ended: every timetable slot of this subject has a last class day before today (PKT). */
  finished: boolean;
}

export const UNGROUPED_SERIAL = "other";

export interface SubjectLookup {
  subjects: SubjectInfo[];
  serials: Set<string>;
  arabicSerialMap: Record<string, string>;
}

/**
 * Resolves the subject serial for a lecture title. Falls back to the Arabic
 * subject map for old titles; returns UNGROUPED_SERIAL when nothing matches.
 */
export function serialForTitle(title: string | null | undefined, lookup: SubjectLookup): string {
  if (!title) return UNGROUPED_SERIAL;

  const match = title.match(/^(\d+\.\d+)\s/);
  if (match && lookup.serials.has(match[1]!)) return match[1]!;

  const arabicSubject = title.split("|")[0]?.trim();
  if (arabicSubject && lookup.arabicSerialMap[arabicSubject]) {
    return lookup.arabicSerialMap[arabicSubject]!;
  }

  return UNGROUPED_SERIAL;
}
