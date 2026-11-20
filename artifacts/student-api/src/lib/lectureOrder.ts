/**
 * The order of a subject's lectures in the student portal: by class date, oldest first.
 *
 * The class date is the DD-MM-YYYY in the title. `driveCreatedTime` is not used on its own, because a class added by
 * hand later (a backfilled older recording) carries the day it was copied into Drive, which would list it after
 * newer classes. A title with no date falls back to the PKT day of the recording. Lectures of one day keep their
 * recording order (Part 1 before Part 2), then id.
 */

const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

/** The class date as YYYY-MM-DD, or "" when neither the title nor the recording time gives one. */
export function classDate(title: string, driveCreatedTime: string | null): string {
  const m = /(\d{2})-(\d{2})-(\d{4})/.exec(title);
  if (m) {
    const [, dd, mm, yyyy] = m;
    if (Number(mm) >= 1 && Number(mm) <= 12 && Number(dd) >= 1 && Number(dd) <= 31) return `${yyyy}-${mm}-${dd}`;
  }
  if (!driveCreatedTime) return "";
  const t = new Date(driveCreatedTime).getTime();
  return Number.isNaN(t) ? "" : new Date(t + PKT_OFFSET_MS).toISOString().slice(0, 10);
}

export function compareLectures(
  a: { id: number; title: string; driveCreatedTime: string | null },
  b: { id: number; title: string; driveCreatedTime: string | null },
): number {
  return (
    classDate(a.title, a.driveCreatedTime).localeCompare(classDate(b.title, b.driveCreatedTime)) ||
    (a.driveCreatedTime ?? "").localeCompare(b.driveCreatedTime ?? "") ||
    a.id - b.id
  );
}
