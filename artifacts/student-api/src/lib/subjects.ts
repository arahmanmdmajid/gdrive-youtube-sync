// Subject grouping for the student platform. Lectures (done jobs) are grouped
// by the serial prefix already present in their titles, e.g.
// "1.2 Jalalain Part 2 | Ustad Haseeb | 18-05-2026".
// Older uploads have Arabic titles without a serial; those are matched by
// Arabic subject name instead.
//
// The subject list is a live union of two admin-editable tables, since neither
// alone is complete:
//   - scheduleSlotsTable (the DB-backed weekly schedule — see api-server's
//     routes/schedule.ts) covers every subject with a video Meet time slot,
//     and is the only source for the Arabic-name lookup.
//   - lectureNamesTable (the manual "Lecture Name" picker's option list — see
//     api-server's routes/lectureNames.ts) additionally covers subjects with
//     no video slot at all, e.g. "Khair ul Usool" (audio-only lectures).
// Deriving from these live tables instead of a hardcoded copy means a
// subject/teacher rename in either admin screen shows up here immediately
// instead of silently drifting out of sync.

import { db, scheduleSlotsTable, lectureNamesTable } from "@workspace/db";

export interface SubjectInfo {
  serial: string;
  nameEn: string;
  teacherEn: string;
}

export const UNGROUPED_SERIAL = "other";

export interface SubjectLookup {
  subjects: SubjectInfo[];
  serials: Set<string>;
  arabicSerialMap: Record<string, string>;
}

// Matches the lecture-name picker's "X.X Subject | Teacher" format.
const LECTURE_NAME_RE = /^(\d+\.\d+)\s+(.*?)\s*\|\s*(.*)$/;

/** Loads the live subject list (schedule ∪ lecture names) + Arabic-name lookup (schedule only), deduped by serial. */
export async function loadSubjectLookup(): Promise<SubjectLookup> {
  const [scheduleRows, lectureNameRows] = await Promise.all([
    db
      .select({
        serial: scheduleSlotsTable.serial,
        subjectEn: scheduleSlotsTable.subjectEn,
        teacherEn: scheduleSlotsTable.teacherEn,
        subjectAr: scheduleSlotsTable.subjectAr,
      })
      .from(scheduleSlotsTable),
    db.select({ name: lectureNamesTable.name }).from(lectureNamesTable),
  ]);

  const bySerial = new Map<string, SubjectInfo>();
  const arabicSerialMap: Record<string, string> = {};
  for (const row of scheduleRows) {
    if (!bySerial.has(row.serial)) {
      bySerial.set(row.serial, { serial: row.serial, nameEn: row.subjectEn, teacherEn: row.teacherEn });
    }
    if (!(row.subjectAr in arabicSerialMap)) {
      arabicSerialMap[row.subjectAr] = row.serial;
    }
  }
  for (const row of lectureNameRows) {
    const match = row.name.match(LECTURE_NAME_RE);
    if (!match) continue;
    const [, serial, nameEn, teacherEn] = match;
    if (!bySerial.has(serial!)) {
      bySerial.set(serial!, { serial: serial!, nameEn: nameEn!, teacherEn: teacherEn! });
    }
  }

  const subjects = [...bySerial.values()].sort((a, b) => a.serial.localeCompare(b.serial));
  return { subjects, serials: new Set(subjects.map((s) => s.serial)), arabicSerialMap };
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
