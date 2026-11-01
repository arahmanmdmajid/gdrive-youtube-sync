import { compareHours, daysBetween, projectFinish, type ComparisonRow, type Projection } from "./examPlan";
import type { StudyPlanInput } from "./studyPlan";

export interface LectureLength {
  id: number;
  durationSeconds: number | null;
}

export interface Summary {
  lectures: { total: number; completed: number; remaining: number };
  seconds: { total: number; completed: number; remaining: number };
  /** True when some lecture had no stored length and the average of the others stood in for it. */
  approximate: boolean;
}

/** Counts and study time, by time not by lecture count. A lecture with no length counts as the average. */
export function summarizeLectures(lectures: LectureLength[], completedIds: Set<number>): Summary {
  const known = lectures.filter((l) => l.durationSeconds != null && l.durationSeconds > 0);
  const average = known.length ? known.reduce((s, l) => s + l.durationSeconds!, 0) / known.length : 0;
  let total = 0;
  let completed = 0;
  let completedCount = 0;
  for (const l of lectures) {
    const seconds = l.durationSeconds != null && l.durationSeconds > 0 ? l.durationSeconds : average;
    total += seconds;
    if (completedIds.has(l.id)) {
      completed += seconds;
      completedCount++;
    }
  }
  return {
    lectures: { total: lectures.length, completed: completedCount, remaining: lectures.length - completedCount },
    seconds: { total: Math.round(total), completed: Math.round(completed), remaining: Math.round(total - completed) },
    approximate: known.length < lectures.length,
  };
}

export type ReadinessState = "no_lectures" | "done" | "exam_passed" | "needs_plan" | "on_track" | "at_risk";

export interface Readiness extends Summary {
  examDate: string;
  today: string;
  daysToExam: number;
  plan: StudyPlanInput | null;
  state: ReadinessState;
  /** Set when the state is on_track or at_risk. */
  projection: Projection | null;
  message: string | null;
  comparison: ComparisonRow[];
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function dayLabel(iso: string, todayYear: string): string {
  const [y, m, d] = iso.split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1]}${y === todayYear ? "" : ` ${y}`}`;
}

const hoursText = (h: number) => `${h} ${h === 1 ? "hour" : "hours"}`;
const daysText = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

function projectionMessage(plan: StudyPlanInput, p: Projection, today: string): string {
  const pace = `At ${hoursText(plan.hoursPerDay)} a day${plan.daysPerWeek < 7 ? `, ${daysText(plan.daysPerWeek)} a week` : ""}`;
  const when = dayLabel(p.finishDate!, today.slice(0, 4));
  if (p.status === "on_track") {
    const rel = p.daysSpare === 0 ? "on the day of your exam" : `${daysText(p.daysSpare!)} before your exam`;
    return `${pace}, you will finish all lectures by ${when}, ${rel}.`;
  }
  const tail = p.achievable
    ? `To finish on time you need at least ${hoursText(p.minHoursPerDay!)} a day.`
    : "Even 24 hours a day would not be enough.";
  return `${pace}, you will finish all lectures by ${when}, ${daysText(p.daysShort!)} after your exam. ${tail}`;
}

export function buildReadiness(input: {
  lectures: LectureLength[];
  completedIds: Set<number>;
  plan: StudyPlanInput | null;
  today: string;
  examDate: string;
}): Readiness {
  const { lectures, completedIds, plan, today, examDate } = input;
  const summary = summarizeLectures(lectures, completedIds);
  const daysPerWeek = plan?.daysPerWeek ?? 7;
  const dates = { today, examDate };
  const base = {
    ...summary,
    examDate,
    today,
    daysToExam: daysBetween(today, examDate),
    plan,
    projection: null,
    comparison: [] as ComparisonRow[],
  };

  if (summary.lectures.total === 0) return { ...base, state: "no_lectures", message: "No lectures have been uploaded yet." };
  if (summary.lectures.remaining === 0) return { ...base, state: "done", message: "You have completed all lectures." };
  if (base.daysToExam < 0) return { ...base, state: "exam_passed", message: null };

  const comparison = compareHours({ remainingSeconds: summary.seconds.remaining, daysPerWeek, ...dates });
  if (!plan) {
    return { ...base, comparison, state: "needs_plan", message: "Enter how many hours a day you can study to see when you will finish." };
  }
  const projection = projectFinish({ remainingSeconds: summary.seconds.remaining, ...plan, ...dates });
  return {
    ...base,
    comparison,
    projection,
    state: projection.status === "on_track" ? "on_track" : "at_risk",
    message: projectionMessage(plan, projection, today),
  };
}
