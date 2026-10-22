import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateGroup, DEFAULT_CONFIG, RULE_VERSION, type GroupInput, type GroupFile, type CheckId } from "./autoReview";
import {
  TODAY,
  cleanDay,
  outOfOrderDay,
  skippedClassDay,
  extraFileDay,
  splitDay,
  shortRecordingDay,
  overlapDay,
  edgeDurationDay,
} from "./autoReview.fixtures";

const checks = (input: GroupInput, config = DEFAULT_CONFIG) => [...new Set(evaluateGroup(input, config).reasons.map((r) => r.check))].sort();
const copy = (d: GroupInput): GroupInput => structuredClone(d);

// ── Real days ───────────────────────────────────────────────────────────────

test("a clean day is clean and approves exactly its needs_review jobs", () => {
  const v = evaluateGroup(cleanDay);
  assert.equal(v.verdict, "clean");
  assert.deepEqual(v.reasons, []);
  assert.deepEqual(v.approvableJobIds, cleanDay.files.filter((f) => f.status === "needs_review").map((f) => f.id));
  assert.equal(v.approvableJobIds.length, 6);
  assert.equal(v.ruleVersion, RULE_VERSION);
});

test("titles that are the day's slots in a different order always hold", () => {
  assert.deepEqual(checks(outOfOrderDay), ["title_slot_mismatch"]);
  const r = evaluateGroup(outOfOrderDay).reasons.find((x) => x.check === "title_slot_mismatch");
  assert.match(r?.message ?? "", /different order|does not match/);
  assert.deepEqual(evaluateGroup(outOfOrderDay).approvableJobIds, []);
});

test("fewer recordings than slots (a skipped class) holds, and the long gap is reported", () => {
  assert.deepEqual(checks(skippedClassDay), ["count_mismatch", "possible_skipped_class"]);
});

test("more recordings than slots holds on the count", () => {
  assert.deepEqual(checks(extraFileDay), ["count_mismatch"]);
});

test("a split or merged lecture (Part suffix) holds", () => {
  const c = checks(splitDay);
  assert.ok(c.includes("split_suspected"));
  assert.ok(c.includes("title_slot_mismatch"));
});

test("a recording under five minutes holds the whole group and stays in the count", () => {
  assert.deepEqual(checks(shortRecordingDay), ["short_recording"]);
  const r = evaluateGroup(shortRecordingDay).reasons.find((x) => x.check === "short_recording")!;
  assert.equal(r.jobIds.length, 1);
  const f = shortRecordingDay.files.find((x) => x.id === r.jobIds[0])!;
  assert.ok(f.durationSec! < DEFAULT_CONFIG.shortRecordingSec);
  // it is counted: no count_mismatch although it is short
  assert.ok(!checks(shortRecordingDay).includes("count_mismatch"));
});

test("two recordings that ran at the same time hold", () => {
  assert.deepEqual(checks(overlapDay), ["recordings_overlap"]);
});

test("a lecture at the edge of the normal length holds (the 7 minute class)", () => {
  assert.deepEqual(checks(edgeDurationDay), ["duration_out_of_band"]);
});

// ── Variants of the clean day, one check at a time ─────────────────────────

test("rejected recordings are ignored", () => {
  const d = copy(cleanDay);
  d.files.push({ ...d.files[0], id: 99, status: "rejected", durationSec: 30, title: "junk" });
  assert.equal(evaluateGroup(d).verdict, "clean");
});

test("a title used by another job outside the group collides", () => {
  const d = copy(cleanDay);
  d.otherTitles = [d.files[2].title!];
  assert.deepEqual(checks(d), ["title_collision"]);
});

test("a file over 500 MB holds", () => {
  const d = copy(cleanDay);
  d.files[1].sizeBytes = 600 * 1024 * 1024;
  assert.deepEqual(checks(d), ["oversized_file"]);
});

test("a group dated today holds", () => {
  const d = copy(cleanDay);
  d.today = d.date;
  assert.deepEqual(checks(d), ["group_dated_today"]);
  assert.notEqual(cleanDay.date, TODAY);
});

test("a [REVIEW] marker holds", () => {
  const d = copy(cleanDay);
  d.files[0].title = `[REVIEW: large file] ${d.files[0].title}`;
  const c = checks(d);
  assert.ok(c.includes("review_marker"));
});

test("a title a person confirmed that differs from the slot holds as a human conflict", () => {
  const d = copy(cleanDay);
  d.files[1].title = d.files[3].title; // a confirmed name that belongs to another slot
  d.files[1].confirmed = true;
  const r = evaluateGroup(d).reasons;
  assert.ok(r.some((x) => x.check === "human_title_differs" && x.jobIds.includes(d.files[1].id)));
  assert.ok(!r.some((x) => x.check === "title_slot_mismatch" && x.jobIds.includes(d.files[1].id)), "reported once, as the human conflict");
  assert.ok(r.some((x) => x.check === "duplicate_suspected"), "and it now shares a title with another file");
});

test("missing evidence holds and is never read as success", () => {
  for (const [field, set] of [
    ["durationSec", (f: GroupFile) => (f.durationSec = null)],
    ["createdTime", (f: GroupFile) => (f.createdTime = null)],
    ["title", (f: GroupFile) => (f.title = null)],
    ["sizeBytes", (f: GroupFile) => (f.sizeBytes = null)],
  ] as const) {
    const d = copy(cleanDay);
    set(d.files[2]);
    const v = evaluateGroup(d);
    assert.equal(v.verdict, "hold", `${field} missing`);
    assert.ok(v.reasons.some((r) => r.check === "missing_evidence" && r.jobIds.includes(d.files[2].id)), `${field} missing is named`);
  }
});

test("a finished job from before sizes were recorded needs no size", () => {
  const d = copy(cleanDay);
  d.files[0].status = "done";
  d.files[0].sizeBytes = null;
  assert.equal(evaluateGroup(d).verdict, "clean");
  assert.equal(evaluateGroup(d).approvableJobIds.includes(d.files[0].id), false, "a done job is not approvable");
});

test("duplicates: same size, same title, or almost the same length", () => {
  const sameSize = copy(cleanDay);
  sameSize.files[1].sizeBytes = sameSize.files[0].sizeBytes;
  assert.ok(checks(sameSize).includes("duplicate_suspected"));

  const closeLength = copy(cleanDay);
  closeLength.files[1].durationSec = closeLength.files[0].durationSec! + 2;
  assert.ok(checks(closeLength).includes("duplicate_suspected"));

  const farLength = copy(cleanDay);
  farLength.files[1].durationSec = farLength.files[0].durationSec! + 30;
  assert.ok(!checks(farLength).includes("duplicate_suspected"));
});

test("no schedule for the day, no recordings, audio, another date, unknown code", () => {
  const noSlots = copy(cleanDay);
  noSlots.slots = [];
  assert.ok(checks(noSlots).includes("no_schedule"));

  assert.deepEqual(checks({ ...cleanDay, files: [] }), ["no_files"]);

  const audio = copy(cleanDay);
  audio.files[0].contentType = "audio";
  assert.ok(checks(audio).includes("not_video"));

  const otherDay = copy(cleanDay);
  otherDay.files[0].createdTime = "2026-10-13T16:00:00.000Z";
  assert.ok(checks(otherDay).includes("group_identity"));

  const noCode = copy(cleanDay);
  noCode.meetingCode = null;
  assert.ok(checks(noCode).includes("group_identity"));
});

test("a recording far from its slot's start time holds", () => {
  const d = copy(cleanDay);
  const t = Date.parse(d.files[5].createdTime!) + 5 * 3600 * 1000; // five hours late
  d.files[5].createdTime = new Date(t).toISOString();
  assert.ok(checks(d).includes("timing_implausible"));
});

test("a recording that started long before the previous one holds as start order", () => {
  const d = copy(cleanDay);
  const prevEnd = Date.parse(d.files[2].createdTime!);
  d.files[3].createdTime = new Date(prevEnd + 10 * 60 * 1000).toISOString(); // ends 10 min after the previous
  d.files[3].durationSec = 55 * 60; // so it started 45 min before the previous one ended
  assert.ok(checks(d).includes("start_order"));
  assert.ok(checks(d).includes("recordings_overlap"));
});

test("every failed check is reported, not only the first", () => {
  const d = copy(cleanDay);
  d.files[0].sizeBytes = 700 * 1024 * 1024;
  d.files[1].durationSec = 2 * 60;
  d.otherTitles = [d.files[4].title!];
  const c = checks(d);
  for (const id of ["oversized_file", "short_recording", "title_collision"] as CheckId[]) assert.ok(c.includes(id), id);
});

test("a long gap is not a skipped class when every slot has a recording", () => {
  const d = copy(cleanDay);
  // the clean day already has a 76 minute gap and one file per slot
  const gaps = d.files.slice(1).map((f, i) => (Date.parse(f.createdTime!) - Date.parse(d.files[i].createdTime!)) / 60000);
  assert.ok(Math.max(...gaps) > DEFAULT_CONFIG.maxGapBetweenRecordingsSec / 60);
  assert.equal(evaluateGroup(d).verdict, "clean");
});

// ── Purity and configuration ───────────────────────────────────────────────

test("it does not change its input and gives the same answer twice", () => {
  const d = copy(cleanDay);
  d.files.reverse(); // unsorted input
  const before = JSON.stringify(d);
  const a = evaluateGroup(d);
  const b = evaluateGroup(d);
  assert.equal(JSON.stringify(d), before);
  assert.deepEqual(a, b);
  assert.equal(a.verdict, "clean", "input order does not matter");
});

test("thresholds come from the config", () => {
  assert.equal(evaluateGroup(cleanDay).verdict, "clean");
  const strict = { ...DEFAULT_CONFIG, maxDurationSec: 20 * 60 };
  assert.ok(checks(cleanDay, strict).includes("duration_out_of_band"));
});
