/**
 * A subject is a finished course when any one of its timetable slots has an end day (the last class day,
 * YYYY-MM-DD) before `today` (PKT, same format), so the end day need not be set on each slot. A subject with no
 * slot at all (audio-only, or known only from the lecture names) is never marked finished.
 */
export function isCourseFinished(ends: (string | null)[], today: string): boolean {
  return ends.some((end) => end !== null && end < today);
}
