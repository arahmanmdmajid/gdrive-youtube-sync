// Compares what the day-approval rules said with what the reviewer then did (issue #27, Stage 2).
//
// Pure on purpose: it takes plain data (the jobs of each day and the history rows) and returns a report.
// It reads nothing and writes nothing. The rules only say clean or hold; it never changes a job.

export const HUMAN_EVENTS = new Set(["approve", "edit", "reject", "restore", "undo"]);

/** Reasons that mark a hard day: the ones the gate wants held correctly. */
export const HARD_CHECKS = new Set(["short_recording", "possible_skipped_class", "ambiguous_split", "no_valid_split", "count_mismatch", "teacher_mismatch"]);

/** The gate asks for both meeting codes and every class weekday (Mon, Tue, Fri, Sat) to be covered. */
export const REQUIRED_CODES = ["uys-vqbk-mnn", "zeo-iaqz-qqu"];
export const REQUIRED_WEEKDAYS = [1, 2, 5, 6];
export const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const MIN_DAYS_OF_DATA = 28;
export const MIN_CLEAN_REVIEWED = 30;
export const MIN_HARD_HELD = 5;

export interface AgreementJob {
  id: number;
  status: string;
  /** PKT date of the recording, DD-MM-YYYY. */
  date: string;
  code: string;
  /** 0 = Sunday ... 6 = Saturday. */
  weekday: number;
  /** The title the job has now: the YouTube title for a finished job, the proposed title otherwise. */
  finalTitle: string | null;
}

export interface AgreementEvent {
  id: number;
  jobId: number;
  eventType: string;
  actor: string;
  groupEventId: string;
  /** Milliseconds since the epoch. */
  createdAt: number;
  fromTitle: string | null;
  toTitle: string | null;
  detail: string | null;
}

export type Outcome = "agreed" | "false_clean" | "held_correctly" | "unnecessary_hold" | "pending" | "not_comparable";

export interface DayReport {
  key: string;
  date: string;
  code: string;
  weekday: number;
  /** The verdict the reviewer could have seen (null when none was recorded). */
  verdict: "clean" | "hold" | null;
  reasons: string[];
  hard: boolean;
  reviewed: boolean;
  outcome: Outcome;
  /** One plain sentence on why. */
  why: string;
}

export interface Tally {
  days: number;
  reviewedClean: number;
  agreed: number;
  falseClean: number;
  heldCorrectly: number;
  unnecessaryHold: number;
  pending: number;
  notComparable: number;
}

export interface GateItem {
  id: string;
  text: string;
  /** true or false when it can be computed, null when it needs a person or a test run. */
  met: boolean | null;
  value: string;
}

export interface AgreementReport {
  generatedAt: string;
  firstVerdictAt: string | null;
  daysOfData: number | null;
  totals: Tally;
  byCode: Record<string, Tally>;
  byWeekday: Record<string, Tally>;
  hardHeldCorrectly: number;
  days: DayReport[];
  gate: GateItem[];
}

interface ParsedVerdict {
  verdict: "clean" | "hold";
  reasons: string[];
  expected: Map<number, string>;
}

function parseVerdict(detail: string | null): ParsedVerdict | null {
  if (!detail) return null;
  try {
    const d = JSON.parse(detail) as {
      verdict?: string;
      reasons?: { check?: string }[];
      lectures?: { titles?: { jobId: number; title: string }[] }[];
    };
    if (d.verdict !== "clean" && d.verdict !== "hold") return null;
    const expected = new Map<number, string>();
    for (const l of d.lectures ?? []) for (const t of l.titles ?? []) expected.set(t.jobId, t.title);
    return { verdict: d.verdict, reasons: [...new Set((d.reasons ?? []).map((r) => r.check ?? "").filter(Boolean))], expected };
  } catch {
    return null;
  }
}

const emptyTally = (): Tally => ({ days: 0, reviewedClean: 0, agreed: 0, falseClean: 0, heldCorrectly: 0, unnecessaryHold: 0, pending: 0, notComparable: 0 });

function addToTally(t: Tally, d: DayReport) {
  t.days++;
  if (d.verdict === "clean" && (d.outcome === "agreed" || d.outcome === "false_clean")) t.reviewedClean++;
  if (d.outcome === "agreed") t.agreed++;
  else if (d.outcome === "false_clean") t.falseClean++;
  else if (d.outcome === "held_correctly") t.heldCorrectly++;
  else if (d.outcome === "unnecessary_hold") t.unnecessaryHold++;
  else if (d.outcome === "pending") t.pending++;
  else t.notComparable++;
}

export function computeAgreement(jobs: AgreementJob[], events: AgreementEvent[], now: Date = new Date()): AgreementReport {
  const byDay = new Map<string, AgreementJob[]>();
  for (const j of jobs) {
    const key = `${j.date}|${j.code}`;
    (byDay.get(key) ?? byDay.set(key, []).get(key)!).push(j);
  }
  const eventsByJob = new Map<number, AgreementEvent[]>();
  for (const e of events) (eventsByJob.get(e.jobId) ?? eventsByJob.set(e.jobId, []).get(e.jobId)!).push(e);

  const days: DayReport[] = [];
  for (const [key, dayJobs] of byDay) {
    const first = dayJobs[0];
    const dayEvents = dayJobs.flatMap((j) => eventsByJob.get(j.id) ?? []);
    const verdictRows = dayEvents.filter((e) => e.eventType === "auto_verdict");
    // Nothing to compare for a day that never had a verdict and is still open.
    const human = dayEvents.filter((e) => e.actor === "admin" && HUMAN_EVENTS.has(e.eventType));
    const t0 = human.length ? Math.min(...human.map((e) => e.createdAt)) : null;

    // The verdict the reviewer could have seen: the latest group of verdict rows made before the first human action
    // (or, while nothing has been done yet, the latest of all).
    const groups = new Map<string, { time: number; row: AgreementEvent }>();
    for (const r of verdictRows) {
      const g = groups.get(r.groupEventId);
      if (!g || r.createdAt > g.time) groups.set(r.groupEventId, { time: r.createdAt, row: g?.row ?? r });
    }
    const usable = [...groups.values()].filter((g) => t0 === null || g.time <= t0).sort((a, b) => b.time - a.time);
    let parsed: ParsedVerdict | null = null;
    for (const g of usable) {
      parsed = parseVerdict(g.row.detail);
      if (parsed) break;
    }

    const active = dayJobs.filter((j) => j.status !== "rejected");
    const reviewed = t0 !== null && active.length > 0 && active.every((j) => j.status !== "needs_review");
    const reasons = parsed?.reasons ?? [];
    const hard = parsed?.verdict === "hold" && reasons.some((r) => HARD_CHECKS.has(r));
    const base = { key, date: first.date, code: first.code, weekday: first.weekday, verdict: parsed?.verdict ?? null, reasons, hard, reviewed };

    if (!reviewed) {
      days.push({ ...base, outcome: "pending", why: parsed ? "Not reviewed yet." : "Not reviewed yet and no verdict recorded." });
      continue;
    }
    if (!parsed) {
      days.push({ ...base, outcome: "not_comparable", why: "Reviewed, but no verdict was recorded before the first action." });
      continue;
    }

    const rejected = human.some((e) => e.eventType === "reject");
    const titleChanged = human.some((e) => e.fromTitle != null && e.toTitle != null && e.fromTitle !== e.toTitle);

    if (parsed.verdict === "clean") {
      const byId = new Map(dayJobs.map((j) => [j.id, j]));
      const rejectedCovered = [...parsed.expected.keys()].filter((id) => byId.get(id)?.status === "rejected");
      const wrongTitle = [...parsed.expected].filter(([id, title]) => {
        const j = byId.get(id);
        return j && j.status !== "rejected" && j.finalTitle !== title;
      });
      if (rejectedCovered.length > 0) {
        days.push({ ...base, outcome: "false_clean", why: `The rules said clean but ${rejectedCovered.length} recording(s) they covered were rejected.` });
      } else if (wrongTitle.length > 0) {
        days.push({ ...base, outcome: "false_clean", why: `The rules said clean but ${wrongTitle.length} recording(s) ended with a different title from the one they gave.` });
      } else {
        days.push({ ...base, outcome: "agreed", why: "Clean, and every recording ended with the title the rules gave." });
      }
    } else if (rejected || titleChanged) {
      days.push({ ...base, outcome: "held_correctly", why: rejected ? "Held, and something was rejected." : "Held, and a title was changed." });
    } else {
      days.push({ ...base, outcome: "unnecessary_hold", why: "Held, but everything was approved as proposed." });
    }
  }
  days.sort((a, b) => a.key.localeCompare(b.key));

  const totals = emptyTally();
  const byCode: Record<string, Tally> = {};
  const byWeekday: Record<string, Tally> = {};
  for (const d of days) {
    addToTally(totals, d);
    addToTally((byCode[d.code] ??= emptyTally()), d);
    addToTally((byWeekday[WEEKDAY_NAMES[d.weekday]] ??= emptyTally()), d);
  }

  const verdictTimes = events.filter((e) => e.eventType === "auto_verdict").map((e) => e.createdAt);
  const firstVerdict = verdictTimes.length ? Math.min(...verdictTimes) : null;
  const daysOfData = firstVerdict === null ? null : Math.floor((now.getTime() - firstVerdict) / 86_400_000);

  const reviewedClean = days.filter((d) => d.verdict === "clean" && (d.outcome === "agreed" || d.outcome === "false_clean"));
  const codesCovered = new Set(reviewedClean.map((d) => d.code));
  const weekdaysCovered = new Set(reviewedClean.map((d) => d.weekday));
  const missingCodes = REQUIRED_CODES.filter((c) => !codesCovered.has(c));
  const missingWeekdays = REQUIRED_WEEKDAYS.filter((w) => !weekdaysCovered.has(w)).map((w) => WEEKDAY_NAMES[w]);
  const hardHeld = days.filter((d) => d.hard && d.outcome === "held_correctly").length;

  const gate: GateItem[] = [
    { id: "days_of_data", text: `At least ${MIN_DAYS_OF_DATA} days of recorded verdicts`, met: daysOfData === null ? false : daysOfData >= MIN_DAYS_OF_DATA, value: daysOfData === null ? "no verdicts recorded" : `${daysOfData} days` },
    { id: "clean_reviewed", text: `At least ${MIN_CLEAN_REVIEWED} days judged clean and reviewed by you`, met: reviewedClean.length >= MIN_CLEAN_REVIEWED, value: `${reviewedClean.length}` },
    {
      id: "coverage",
      text: "Both meeting codes and Monday, Tuesday, Friday and Saturday covered by reviewed clean days",
      met: missingCodes.length === 0 && missingWeekdays.length === 0,
      value: missingCodes.length === 0 && missingWeekdays.length === 0 ? "all covered" : `missing: ${[...missingCodes, ...missingWeekdays].join(", ")}`,
    },
    { id: "hard_held", text: `At least ${MIN_HARD_HELD} hard days (short recording, gap, ambiguity, mismatch) correctly held`, met: hardHeld >= MIN_HARD_HELD, value: `${hardHeld}` },
    { id: "no_false_clean", text: "No day judged clean where you then changed a title or rejected a recording", met: reviewedClean.length > 0 && totals.falseClean === 0, value: reviewedClean.length === 0 ? "nothing measured yet" : `${totals.falseClean} false clean out of ${reviewedClean.length} reviewed clean days` },
    { id: "backlog_replay", text: "The backlog replayed through the rules with no errors", met: null, value: "check by hand" },
    { id: "safety_tests", text: "Undo, recovery and kill-switch tests pass", met: null, value: "check in CI" },
    { id: "explicit_approval", text: "You explicitly approve the switch to active", met: null, value: "your decision" },
  ];

  return {
    generatedAt: now.toISOString(),
    firstVerdictAt: firstVerdict === null ? null : new Date(firstVerdict).toISOString(),
    daysOfData,
    totals,
    byCode,
    byWeekday,
    hardHeldCorrectly: hardHeld,
    days,
    gate,
  };
}
