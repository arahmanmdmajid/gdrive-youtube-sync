export const EXAM_DATE = "2027-01-09";
export const EXAM_TIME_ZONE = "Asia/Karachi";

const DAY_MS = 86_400_000;

/** Dates are plain "YYYY-MM-DD" strings so no time zone or DST can shift them. */
function toMs(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y!, m! - 1, d!);
}

export function addDays(day: string, n: number): string {
  return new Date(toMs(day) + n * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toMs(to) - toMs(from)) / DAY_MS);
}

export function todayIn(timeZone: string = EXAM_TIME_ZONE, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
}

export function isValidHoursPerDay(hours: number): boolean {
  return Number.isFinite(hours) && hours > 0 && hours <= 24;
}

export function isValidDaysPerWeek(days: number): boolean {
  return Number.isInteger(days) && days >= 1 && days <= 7;
}

export type PlanStatus = "done" | "exam_passed" | "on_track" | "at_risk";

export interface PlanInput {
  remainingSeconds: number;
  hoursPerDay: number;
  daysPerWeek: number;
  today: string;
  examDate: string;
}

export interface Projection {
  status: PlanStatus;
  daysToExam: number;
  remainingMinutes: number;
  studyDaysNeeded: number | null;
  finishDate: string | null;
  /** Days between the finish date and the exam, set when on track (0 means finishing on exam day). */
  daysSpare: number | null;
  /** Days the finish date is after the exam, set when at risk. */
  daysShort: number | null;
  /** Smallest hours per day (rounded up to 0.1) that still finishes by the exam. */
  minHoursPerDay: number | null;
  /** False when even 24 hours a day would not be enough. */
  achievable: boolean;
}

// ponytail: study days are assumed to be the first `daysPerWeek` days of each 7-day block starting
// today; real weekday choice would need a per-student weekday set.
function finishDateFor(today: string, studyDays: number, daysPerWeek: number): string {
  const k = studyDays - 1;
  return addDays(today, k + Math.floor(k / daysPerWeek) * (7 - daysPerWeek));
}

/** Study days available from today to the exam, both included, under the same block model. */
function studyDaysUntil(today: string, examDate: string, daysPerWeek: number): number {
  const n = daysBetween(today, examDate) + 1;
  return Math.floor(n / 7) * daysPerWeek + Math.min(n % 7, daysPerWeek);
}

export function projectFinish(input: PlanInput): Projection {
  const { remainingSeconds, hoursPerDay, daysPerWeek, today, examDate } = input;
  if (!isValidHoursPerDay(hoursPerDay)) throw new RangeError("hoursPerDay must be above 0 and at most 24");
  if (!isValidDaysPerWeek(daysPerWeek)) throw new RangeError("daysPerWeek must be a whole number from 1 to 7");

  const daysToExam = daysBetween(today, examDate);
  const remainingMinutes = Math.ceil(Math.max(remainingSeconds, 0) / 60);
  const empty = {
    daysToExam,
    remainingMinutes,
    studyDaysNeeded: null,
    finishDate: null,
    daysSpare: null,
    daysShort: null,
    minHoursPerDay: null,
    achievable: true,
  };

  if (remainingMinutes === 0) return { ...empty, status: "done" };
  if (daysToExam < 0) return { ...empty, status: "exam_passed", achievable: false };

  const perDayMinutes = Math.round(hoursPerDay * 60 * 1e6) / 1e6;
  const studyDaysNeeded = Math.ceil(remainingMinutes / perDayMinutes);
  const finishDate = finishDateFor(today, studyDaysNeeded, daysPerWeek);
  const diff = daysBetween(finishDate, examDate);

  const available = studyDaysUntil(today, examDate, daysPerWeek);
  const minHoursPerDay = Math.ceil(remainingMinutes / available / 6) / 10; // 6 minutes = 0.1 hour

  return {
    status: diff >= 0 ? "on_track" : "at_risk",
    daysToExam,
    remainingMinutes,
    studyDaysNeeded,
    finishDate,
    daysSpare: diff >= 0 ? diff : null,
    daysShort: diff < 0 ? -diff : null,
    minHoursPerDay,
    achievable: minHoursPerDay <= 24,
  };
}

export interface ComparisonRow {
  hoursPerDay: number;
  finishDate: string;
  status: "on_track" | "at_risk";
}

/** Finish dates at a few fixed paces, for the quick comparison table. */
export function compareHours(input: Omit<PlanInput, "hoursPerDay">, hours: number[] = [1, 2, 3, 4]): ComparisonRow[] {
  return hours.flatMap((hoursPerDay) => {
    const p = projectFinish({ ...input, hoursPerDay });
    return p.finishDate && (p.status === "on_track" || p.status === "at_risk")
      ? [{ hoursPerDay, finishDate: p.finishDate, status: p.status }]
      : [];
  });
}
