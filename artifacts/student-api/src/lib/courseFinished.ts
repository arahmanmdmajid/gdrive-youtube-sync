/**
 * A subject is a finished course when every timetable slot it has carries an end day (the last class day,
 * YYYY-MM-DD) before `today` (PKT, same format). A slot with no end day keeps it running, and a subject with no
 * slot at all (audio-only, or known only from the lecture names) is never marked finished.
 */
export function isCourseFinished(ends: (string | null)[], today: string): boolean {
  return ends.length > 0 && ends.every((end) => end !== null && end < today);
}
