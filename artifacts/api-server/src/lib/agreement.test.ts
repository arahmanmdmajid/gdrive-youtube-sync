import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAgreement, type AgreementEvent, type AgreementJob, type DayReport } from "./agreement";

const BASE = Date.UTC(2026, 9, 1, 12, 0, 0);
const min = (n: number) => BASE + n * 60_000;
let nextId = 1;

const verdictEvent = (jobId: number, groupEventId: string, at: number, detail: string | null): AgreementEvent => ({
  id: nextId++, jobId, eventType: "auto_verdict", actor: "system", groupEventId, createdAt: at, fromTitle: null, toTitle: null, detail,
});
const humanEvent = (jobId: number, eventType: string, at: number, from: string | null = null, to: string | null = null, actor = "admin"): AgreementEvent => ({
  id: nextId++, jobId, eventType, actor, groupEventId: `h${nextId}`, createdAt: at, fromTitle: from, toTitle: to, detail: null,
});

const cleanDetail = (titles: Record<number, string>) =>
  JSON.stringify({ verdict: "clean", reasons: [], lectures: [{ titles: Object.entries(titles).map(([id, title]) => ({ jobId: Number(id), title })) }] });
const holdDetail = (...checks: string[]) => JSON.stringify({ verdict: "hold", reasons: checks.map((check) => ({ check, jobIds: [] })), lectures: [] });

interface DayOpts {
  date?: string;
  code?: string;
  weekday?: number;
  statuses?: string[]; // one per job
  finalTitles?: (string | null)[];
}
/** Three jobs for one day. Titles are "<date> t1".."t3". */
function makeDay(o: DayOpts = {}) {
  const date = o.date ?? "05-10-2026";
  const ids = [nextId++, nextId++, nextId++];
  const jobs: AgreementJob[] = ids.map((id, i) => ({
    id, status: o.statuses?.[i] ?? "pending", date, code: o.code ?? "uys-vqbk-mnn", weekday: o.weekday ?? 1,
    finalTitle: o.finalTitles ? o.finalTitles[i] : `${date} t${i + 1}`,
  }));
  const expected = Object.fromEntries(ids.map((id, i) => [id, `${date} t${i + 1}`]));
  return { ids, jobs, expected };
}
const verdictsFor = (ids: number[], group: string, at: number, detail: string) => ids.map((id) => verdictEvent(id, group, at, detail));
const approveAll = (ids: number[], at: number) => ids.map((id, i) => humanEvent(id, "approve", at + i));
const only = (r: ReturnType<typeof computeAgreement>): DayReport => r.days[0];

// ── Clean verdicts ─────────────────────────────────────────────────────────

test("clean, then approved with exactly the titles the rules gave: agreed", () => {
  const d = makeDay();
  const r = computeAgreement(d.jobs, [...verdictsFor(d.ids, "g1", min(0), cleanDetail(d.expected)), ...approveAll(d.ids, min(10))]);
  assert.equal(only(r).outcome, "agreed");
  assert.equal(only(r).verdict, "clean");
  assert.equal(r.totals.agreed, 1);
  assert.equal(r.totals.reviewedClean, 1);
});

test("clean, but a recording ended with a different title: false clean", () => {
  const d = makeDay({ finalTitles: ["05-10-2026 t1", "05-10-2026 t2", "05-10-2026 edited by hand"] });
  const r = computeAgreement(d.jobs, [...verdictsFor(d.ids, "g1", min(0), cleanDetail(d.expected)), ...approveAll(d.ids, min(10)), humanEvent(d.ids[2], "edit", min(11), "05-10-2026 t3", "05-10-2026 edited by hand")]);
  assert.equal(only(r).outcome, "false_clean");
  assert.match(only(r).why, /different title/);
  assert.equal(r.totals.falseClean, 1);
});

test("clean, but a recording it covered was rejected: false clean", () => {
  const d = makeDay({ statuses: ["pending", "pending", "rejected"] });
  const r = computeAgreement(d.jobs, [...verdictsFor(d.ids, "g1", min(0), cleanDetail(d.expected)), humanEvent(d.ids[0], "approve", min(10)), humanEvent(d.ids[1], "approve", min(11)), humanEvent(d.ids[2], "reject", min(12))]);
  assert.equal(only(r).outcome, "false_clean");
  assert.match(only(r).why, /rejected/);
});

test("clean said to change titles, and the reviewer accepted the scan's old ones: false clean", () => {
  const d = makeDay({ finalTitles: ["05-10-2026 t1", "05-10-2026 old shifted 2", "05-10-2026 old shifted 3"] });
  const r = computeAgreement(d.jobs, [...verdictsFor(d.ids, "g1", min(0), cleanDetail(d.expected)), ...approveAll(d.ids, min(10))]);
  assert.equal(only(r).outcome, "false_clean");
});

test("clean, and the reviewer applied the very titles the rules gave (a title change): still agreed", () => {
  const d = makeDay();
  const r = computeAgreement(d.jobs, [
    ...verdictsFor(d.ids, "g1", min(0), cleanDetail(d.expected)),
    humanEvent(d.ids[1], "edit", min(10), "05-10-2026 shifted", d.expected[d.ids[1]]),
    ...approveAll(d.ids, min(11)),
  ]);
  assert.equal(only(r).outcome, "agreed");
});

// ── Hold verdicts ──────────────────────────────────────────────────────────

test("hold, and a title was changed: held correctly", () => {
  const d = makeDay();
  const r = computeAgreement(d.jobs, [...verdictsFor(d.ids, "g1", min(0), holdDetail("count_mismatch")), humanEvent(d.ids[0], "approve", min(10), "a", "b"), humanEvent(d.ids[1], "approve", min(11)), humanEvent(d.ids[2], "approve", min(12))]);
  assert.equal(only(r).outcome, "held_correctly");
  assert.match(only(r).why, /title was changed/);
});

test("hold, and something was rejected: held correctly", () => {
  const d = makeDay({ statuses: ["pending", "pending", "rejected"] });
  const r = computeAgreement(d.jobs, [...verdictsFor(d.ids, "g1", min(0), holdDetail("short_recording")), humanEvent(d.ids[0], "approve", min(10)), humanEvent(d.ids[1], "approve", min(11)), humanEvent(d.ids[2], "reject", min(12))]);
  assert.equal(only(r).outcome, "held_correctly");
});

test("hold, but everything was approved as proposed: unnecessary hold", () => {
  const d = makeDay();
  const r = computeAgreement(d.jobs, [...verdictsFor(d.ids, "g1", min(0), holdDetail("recordings_overlap")), ...approveAll(d.ids, min(10))]);
  assert.equal(only(r).outcome, "unnecessary_hold");
  assert.equal(r.totals.unnecessaryHold, 1);
});

test("hard days are the holds with a short recording, a gap, an ambiguity, a count or a teacher mismatch", () => {
  for (const [check, hard] of [["short_recording", true], ["possible_skipped_class", true], ["ambiguous_split", true], ["no_valid_split", true], ["count_mismatch", true], ["teacher_mismatch", true], ["recordings_overlap", false], ["duplicate_suspected", false], ["title_collision", false]] as const) {
    const d = makeDay();
    const r = computeAgreement(d.jobs, [...verdictsFor(d.ids, "g1", min(0), holdDetail(check)), humanEvent(d.ids[0], "approve", min(10), "a", "b"), humanEvent(d.ids[1], "approve", min(11)), humanEvent(d.ids[2], "approve", min(12))]);
    assert.equal(only(r).hard, hard, check);
    assert.equal(r.hardHeldCorrectly, hard ? 1 : 0, check);
  }
});

// ── Pending, not comparable, and which verdict counts ──────────────────────

test("a day still in review is pending", () => {
  const d = makeDay({ statuses: ["pending", "needs_review", "needs_review"] });
  const r = computeAgreement(d.jobs, [...verdictsFor(d.ids, "g1", min(0), holdDetail("count_mismatch")), humanEvent(d.ids[0], "approve", min(10))]);
  assert.equal(only(r).outcome, "pending");
  assert.equal(only(r).reviewed, false);
});

test("a day with a verdict that nobody has touched is pending, with the latest verdict shown", () => {
  const d = makeDay({ statuses: ["needs_review", "needs_review", "needs_review"] });
  const r = computeAgreement(d.jobs, [...verdictsFor(d.ids, "g1", min(0), holdDetail("count_mismatch")), ...verdictsFor(d.ids, "g2", min(30), cleanDetail(d.expected))]);
  assert.equal(only(r).outcome, "pending");
  assert.equal(only(r).verdict, "clean");
});

test("reviewed with no verdict before the first action, or none at all: not comparable", () => {
  const late = makeDay();
  const r1 = computeAgreement(late.jobs, [...approveAll(late.ids, min(10)), ...verdictsFor(late.ids, "g1", min(20), cleanDetail(late.expected))]);
  assert.equal(only(r1).outcome, "not_comparable", "the verdict came after the reviewer had acted");
  const none = makeDay();
  const r2 = computeAgreement(none.jobs, approveAll(none.ids, min(10)));
  assert.equal(only(r2).outcome, "not_comparable");
  assert.equal(r2.totals.notComparable, 1);
  assert.equal(r2.totals.reviewedClean + r2.totals.agreed + r2.totals.falseClean, 0, "left out of the rates");
});

test("the verdict used is the last one made before the first action; later ones are ignored", () => {
  const d = makeDay();
  const r = computeAgreement(d.jobs, [
    ...verdictsFor(d.ids, "g1", min(0), cleanDetail(d.expected)),
    ...verdictsFor(d.ids, "g2", min(5), holdDetail("count_mismatch")),
    ...approveAll(d.ids, min(10)),
    ...verdictsFor(d.ids, "g3", min(20), cleanDetail(d.expected)), // after the reviewer acted
  ]);
  assert.equal(only(r).verdict, "hold", "g2, the latest before the first action");
  assert.equal(only(r).outcome, "unnecessary_hold");
});

test("an unreadable verdict is skipped in favour of an earlier readable one, and counts as none when it is the only one", () => {
  const d = makeDay();
  const r1 = computeAgreement(d.jobs, [...verdictsFor(d.ids, "g1", min(0), cleanDetail(d.expected)), ...verdictsFor(d.ids, "g2", min(5), "not json {"), ...approveAll(d.ids, min(10))]);
  assert.equal(only(r1).verdict, "clean");
  const e = makeDay();
  const r2 = computeAgreement(e.jobs, [...verdictsFor(e.ids, "g1", min(0), "not json {"), ...verdictsFor(e.ids, "g2", min(1), JSON.stringify({ verdict: "maybe" })), ...approveAll(e.ids, min(10))]);
  assert.equal(only(r2).outcome, "not_comparable");
});

test("only the reviewer's actions count as human: system events do not", () => {
  const d = makeDay({ statuses: ["needs_review", "needs_review", "needs_review"] });
  const r = computeAgreement(d.jobs, [...verdictsFor(d.ids, "g1", min(0), holdDetail("count_mismatch")), humanEvent(d.ids[0], "reproposal", min(5), "a", "b", "system"), humanEvent(d.ids[1], "approve", min(6), "a", "b", "system")]);
  assert.equal(only(r).outcome, "pending");

  // A finished day whose only "approve" was made by the system was not reviewed by a person.
  const e = makeDay();
  const r2 = computeAgreement(e.jobs, [...verdictsFor(e.ids, "g1", min(0), holdDetail("count_mismatch")), ...e.ids.map((id, i) => humanEvent(id, "approve", min(10 + i), "a", "b", "system"))]);
  assert.equal(only(r2).reviewed, false);
  assert.equal(only(r2).outcome, "pending");
});

test("a day whose recordings were all rejected is not counted as reviewed", () => {
  const d = makeDay({ statuses: ["rejected", "rejected", "rejected"] });
  const r = computeAgreement(d.jobs, [...verdictsFor(d.ids, "g1", min(0), holdDetail("short_recording")), ...d.ids.map((id) => humanEvent(id, "reject", min(10)))]);
  assert.equal(only(r).outcome, "pending");
});

// ── Totals, coverage and the gate ──────────────────────────────────────────

/** n clean agreed days spread over both codes and Mon, Tue, Fri, Sat. */
function manyCleanDays(n: number, weekdays = [1, 2, 5, 6]) {
  const jobs: AgreementJob[] = [];
  const events: AgreementEvent[] = [];
  for (let i = 0; i < n; i++) {
    const weekday = weekdays[i % weekdays.length];
    const code = weekday === 1 || weekday === 2 ? "uys-vqbk-mnn" : "zeo-iaqz-qqu";
    const date = `${String(1 + (i % 28)).padStart(2, "0")}-${String(1 + Math.floor(i / 28)).padStart(2, "0")}-2026`;
    const d = makeDay({ date, code, weekday });
    jobs.push(...d.jobs);
    events.push(...verdictsFor(d.ids, `c${i}`, min(i * 100), cleanDetail(d.expected)), ...approveAll(d.ids, min(i * 100 + 10)));
  }
  return { jobs, events };
}

test("totals, by code and by weekday", () => {
  const a = makeDay({ date: "05-10-2026", code: "uys-vqbk-mnn", weekday: 1 });
  const b = makeDay({ date: "02-10-2026", code: "zeo-iaqz-qqu", weekday: 5, finalTitles: ["x", "y", "z"] });
  const c = makeDay({ date: "03-10-2026", code: "zeo-iaqz-qqu", weekday: 6, statuses: ["needs_review", "needs_review", "needs_review"] });
  const r = computeAgreement([...a.jobs, ...b.jobs, ...c.jobs], [
    ...verdictsFor(a.ids, "a", min(0), cleanDetail(a.expected)), ...approveAll(a.ids, min(10)),
    ...verdictsFor(b.ids, "b", min(0), cleanDetail(b.expected)), ...approveAll(b.ids, min(10)),
    ...verdictsFor(c.ids, "c", min(0), holdDetail("count_mismatch")),
  ]);
  assert.deepEqual([r.totals.days, r.totals.agreed, r.totals.falseClean, r.totals.pending], [3, 1, 1, 1]);
  assert.equal(r.byCode["uys-vqbk-mnn"].agreed, 1);
  assert.equal(r.byCode["zeo-iaqz-qqu"].falseClean, 1);
  assert.equal(r.byCode["zeo-iaqz-qqu"].pending, 1);
  assert.equal(r.byWeekday.Mon.agreed, 1);
  assert.equal(r.byWeekday.Fri.falseClean, 1);
  assert.equal(r.byWeekday.Sat.pending, 1);
});

test("the gate: every computable item met with enough covered, correct days", () => {
  const { jobs, events } = manyCleanDays(30);
  const hard = makeDay({ date: "20-11-2026", code: "uys-vqbk-mnn", weekday: 1 });
  const extra = [...verdictsFor(hard.ids, "h", min(0), holdDetail("short_recording")), humanEvent(hard.ids[0], "approve", min(5), "a", "b"), humanEvent(hard.ids[1], "approve", min(6)), humanEvent(hard.ids[2], "approve", min(7))];
  const hardDays = [0, 1, 2, 3, 4].map((i) => {
    const d = makeDay({ date: `0${i + 1}-12-2026`, code: "zeo-iaqz-qqu", weekday: 5 });
    return { d, ev: [...verdictsFor(d.ids, `hd${i}`, min(i), holdDetail("ambiguous_split")), humanEvent(d.ids[0], "approve", min(10 + i), "a", "b"), humanEvent(d.ids[1], "approve", min(11 + i)), humanEvent(d.ids[2], "approve", min(12 + i))] };
  });
  const now = new Date(BASE + 40 * 86_400_000);
  const r = computeAgreement([...jobs, ...hard.jobs, ...hardDays.flatMap((h) => h.d.jobs)], [...events, ...extra, ...hardDays.flatMap((h) => h.ev)], now);
  const g = Object.fromEntries(r.gate.map((x) => [x.id, x]));
  assert.equal(g.days_of_data.met, true);
  assert.equal(g.clean_reviewed.met, true);
  assert.equal(g.coverage.met, true);
  assert.equal(g.hard_held.met, true, g.hard_held.value);
  assert.equal(g.no_false_clean.met, true);
  for (const id of ["backlog_replay", "safety_tests", "explicit_approval"]) assert.equal(g[id].met, null, id);
  assert.equal(r.hardHeldCorrectly, 6);
});

test("the gate: each computable item can fail, and says what is missing", () => {
  const few = manyCleanDays(29, [1, 2, 5]); // 29 days, no Saturday
  const now = new Date(BASE + 10 * 86_400_000);
  const r = computeAgreement(few.jobs, few.events, now);
  const g = Object.fromEntries(r.gate.map((x) => [x.id, x]));
  assert.equal(g.days_of_data.met, false);
  assert.equal(g.clean_reviewed.met, false);
  assert.equal(g.coverage.met, false);
  assert.match(g.coverage.value, /Sat/);
  assert.equal(g.hard_held.met, false);

  const broken = manyCleanDays(30);
  broken.jobs[0].finalTitle = "changed afterwards";
  const r2 = computeAgreement(broken.jobs, broken.events, new Date(BASE + 90 * 86_400_000));
  assert.equal(r2.gate.find((x) => x.id === "no_false_clean")!.met, false);
  assert.equal(r2.totals.falseClean, 1);

  const empty = computeAgreement([], []);
  assert.equal(empty.gate.find((x) => x.id === "days_of_data")!.met, false);
  const noFalse = empty.gate.find((x) => x.id === "no_false_clean")!;
  assert.equal(noFalse.met, false, "no false clean is not met by having measured nothing");
  assert.equal(noFalse.value, "nothing measured yet");
  assert.equal(empty.daysOfData, null);
  assert.deepEqual(empty.days, []);
});

test("it does not change its input", () => {
  const d = makeDay();
  const jobs = d.jobs;
  const events = [...verdictsFor(d.ids, "g1", min(0), cleanDetail(d.expected)), ...approveAll(d.ids, min(10))];
  const before = JSON.stringify([jobs, events]);
  computeAgreement(jobs, events);
  assert.equal(JSON.stringify([jobs, events]), before);
});
