import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateGroup, findSplits, DEFAULT_CONFIG, RULE_VERSION, type GroupInput, type GroupFile, type CheckId } from "./autoReview";
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
  buildDay,
} from "./autoReview.fixtures";

const checks = (input: GroupInput, config = DEFAULT_CONFIG) => [...new Set(evaluateGroup(input, config).reasons.map((r) => r.check))].sort();
const copy = (d: GroupInput): GroupInput => structuredClone(d);

// Lengths chosen so each case has the number of valid groupings the test needs. A lecture of 50 minutes
// cannot be joined to a neighbour (over 55), so it pins the grouping.
const ONE_PER_SLOT = [[27], [26], [28], [27], [30], [26]];
const UNIQUE_SPLIT = [[27], [50], [10, 17], [50], [30], [26]]; // lecture 3 cut by a break; neighbours too long to join
const MULTI_BREAK = [[12, 15], [50], [27], [50], [14, 13], [50]]; // two breaks in one day, still one grouping
const AMBIGUOUS_SPLIT = [[27], [26], [10, 17], [28], [27], [26]]; // the break could belong to several places

// ── Real days ───────────────────────────────────────────────────────────────

test("a clean day is clean and approves exactly its needs_review jobs", () => {
  const v = evaluateGroup(cleanDay);
  assert.equal(v.verdict, "clean");
  assert.deepEqual(v.reasons, []);
  assert.deepEqual(v.approvableJobIds, cleanDay.files.filter((f) => f.status === "needs_review").map((f) => f.id));
  assert.equal(v.approvableJobIds.length, 6);
  assert.equal(v.ruleVersion, RULE_VERSION);
  assert.equal(v.splitCount, 1);
  assert.equal(v.lectures.length, 6);
  assert.ok(v.lectures.every((l) => l.jobIds.length === 1), "one recording per lecture");
  assert.deepEqual(v.titleChanges, []);
});

test("titles that are the day's slots in a different order always hold", () => {
  assert.deepEqual(checks(outOfOrderDay), ["title_slot_mismatch"]);
  const r = evaluateGroup(outOfOrderDay).reasons.find((x) => x.check === "title_slot_mismatch");
  assert.match(r?.message ?? "", /different order|does not match/);
  assert.deepEqual(evaluateGroup(outOfOrderDay).approvableJobIds, []);
});

test("fewer recordings than slots (a skipped class) holds, and the long gap is reported", () => {
  assert.deepEqual(checks(skippedClassDay), ["count_mismatch", "possible_skipped_class"]);
  assert.equal(evaluateGroup(skippedClassDay).splitCount, null, "no grouping can exist");
});

test("one more recording than slots is not a count error: the day can be grouped, here in two ways", () => {
  assert.deepEqual(checks(extraFileDay), ["ambiguous_split"]);
  const v = evaluateGroup(extraFileDay);
  assert.equal(v.splitCount, 2);
  assert.equal(v.alternatives.length, 2);
  assert.deepEqual(v.lectures, [], "no grouping is offered when it is not unique");
});

test("a finished day whose Part title does not fit the grouping holds on the title", () => {
  assert.deepEqual(checks(splitDay), ["title_slot_mismatch"]);
});

test("a recording under five minutes holds the whole day and both readings are shown", () => {
  assert.deepEqual(checks(shortRecordingDay), ["short_recording"]);
  const v = evaluateGroup(shortRecordingDay);
  const r = v.reasons.find((x) => x.check === "short_recording")!;
  assert.equal(r.jobIds.length, 1);
  const f = shortRecordingDay.files.find((x) => x.id === r.jobIds[0])!;
  assert.ok(f.durationSec! < DEFAULT_CONFIG.shortRecordingSec);
  assert.deepEqual(v.readings.map((x) => x.reading), ["as_junk", "as_part"]);
  assert.match(r.message, /junk/);
  assert.match(r.message, /real part/);
  assert.deepEqual(v.lectures, [], "no grouping is offered while a short recording is unresolved");
});

test("two recordings that ran at the same time hold", () => {
  assert.deepEqual(checks(overlapDay), ["recordings_overlap"]);
});

test("a 7 minute class is below the normal lecture length: no valid grouping", () => {
  assert.deepEqual(checks(edgeDurationDay), ["no_valid_split"]);
});

// ── The split search ───────────────────────────────────────────────────────

test("findSplits: counts the ways to cut recordings into lectures of normal length", () => {
  const m = (min: number) => min * 60;
  // 3 recordings, 2 lectures: [a|bc] or [ab|c]
  assert.deepEqual(findSplits([m(20), m(15), m(20)], 2, DEFAULT_CONFIG).splits, [[1, 3], [2, 3]]);
  // the first recording is too long to join anything
  assert.deepEqual(findSplits([m(50), m(15), m(20)], 2, DEFAULT_CONFIG).splits, [[1, 3]]);
  // one recording per lecture, all in band
  assert.deepEqual(findSplits([m(20), m(25)], 2, DEFAULT_CONFIG).splits, [[1, 2]]);
  // a lecture under the minimum, or over the maximum, is not valid
  assert.deepEqual(findSplits([m(3), m(25)], 2, DEFAULT_CONFIG).splits, []);
  assert.deepEqual(findSplits([m(60), m(25)], 2, DEFAULT_CONFIG).splits, []);
  // fewer recordings than lectures can never work
  assert.deepEqual(findSplits([m(20)], 2, DEFAULT_CONFIG).splits, []);
});

test("one recording per slot is clean", () => {
  const v = evaluateGroup(buildDay(ONE_PER_SLOT));
  assert.equal(v.verdict, "clean");
  assert.equal(v.splitCount, 1);
});

test("a lecture cut by a break, with one possible grouping, is clean and says which recordings are parts", () => {
  const d = buildDay(UNIQUE_SPLIT);
  assert.equal(d.files.length, 7);
  const v = evaluateGroup(d);
  assert.equal(v.verdict, "clean", JSON.stringify(v.reasons));
  assert.equal(v.splitCount, 1);
  assert.deepEqual(v.lectures.map((l) => l.jobIds.length), [1, 1, 2, 1, 1, 1]);
  const lec = v.lectures[2];
  assert.deepEqual(lec.jobIds, [3, 4]);
  assert.equal(lec.titles[0].title, `${d.slots[2].title} | Part 1`);
  assert.equal(lec.titles[1].title, `${d.slots[2].title} | Part 2`);
  assert.equal(v.approvableJobIds.length, 7);
});

test("the scan's positional proposals are listed as title changes, not as a reason to hold", () => {
  const d = buildDay(UNIQUE_SPLIT);
  const v = evaluateGroup(d);
  // the first two recordings already have the right titles; the five after the break are shifted by one
  assert.deepEqual(v.titleChanges.map((c) => c.jobId), [3, 4, 5, 6, 7]);
  assert.equal(v.titleChanges[0].from, d.slots[2].title);
  assert.equal(v.titleChanges[0].to, `${d.slots[2].title} | Part 1`);
  assert.equal(v.titleChanges[4].from, "Fallback title for an extra recording");
  assert.equal(v.titleChanges[4].to, d.slots[5].title);
});

test("several breaks in one day are still one grouping when no recording can join a neighbour", () => {
  const d = buildDay(MULTI_BREAK);
  assert.equal(d.files.length, 8);
  const v = evaluateGroup(d);
  assert.equal(v.verdict, "clean", JSON.stringify(v.reasons));
  assert.deepEqual(v.lectures.map((l) => l.jobIds.length), [2, 1, 1, 1, 2, 1]);
  assert.equal(v.lectures[0].titles[1].title, `${d.slots[0].title} | Part 2`);
  assert.equal(v.lectures[4].titles[0].title, `${d.slots[4].title} | Part 1`);
});

test("a break that could belong to several places holds as ambiguous and lists alternatives", () => {
  const d = buildDay(AMBIGUOUS_SPLIT);
  const v = evaluateGroup(d);
  assert.equal(v.verdict, "hold");
  assert.deepEqual(checks(d), ["ambiguous_split"]);
  assert.ok(v.splitCount! > 1);
  assert.equal(v.alternatives.length, DEFAULT_CONFIG.alternativesListed);
  for (const alt of v.alternatives) {
    assert.equal(alt.length, 6, "six lectures");
    assert.deepEqual(alt.flat(), d.files.map((f) => f.id), "every recording, in order");
  }
  assert.deepEqual(v.lectures, []);
});

test("a recording too long to be part of any normal lecture: no valid grouping", () => {
  const d = buildDay([[27], [26], [70], [28], [27], [26]]);
  assert.deepEqual(checks(d), ["no_valid_split"]);
  assert.equal(evaluateGroup(d).splitCount, 0);
});

test("a short recording: both readings, and the day holds even when both give the same grouping", () => {
  const d = buildDay([[27], [50], [10, 17], [50], [30], [26, 2]]); // a 2 minute recording (about 4 min 16 s with the builder's offset) after the last lecture
  assert.ok(d.files[7].durationSec! < DEFAULT_CONFIG.shortRecordingSec, "it really is short");
  const v = evaluateGroup(d);
  assert.equal(v.verdict, "hold");
  assert.deepEqual(checks(d), ["short_recording"]);
  assert.deepEqual(v.readings.map((r) => [r.reading, r.validSplits]), [["as_junk", 1], ["as_part", 1]]);
  assert.deepEqual(v.lectures, []);
});

test("a day with very many possible groupings stops counting at the cap and says so", () => {
  const d = buildDay([[10, 10, 10], [10, 10, 10], [10, 10], [10, 10], [10, 10], [10, 10]]); // 14 recordings of 10 minutes
  const t0 = Date.now();
  const v = evaluateGroup(d);
  assert.ok(Date.now() - t0 < 2000, "the search is bounded");
  assert.equal(v.splitCount, DEFAULT_CONFIG.splitSearchCap);
  assert.match(v.reasons.find((r) => r.check === "ambiguous_split")!.message, /200\+/);
});

// ── Titles: what holds the day and what is only a proposal ─────────────────

test("a locked title that disagrees with the grouping holds; an unconfirmed proposal does not", () => {
  const base = buildDay(UNIQUE_SPLIT);

  const unconfirmedWrong = copy(base);
  unconfirmedWrong.files[4].title = "Some other title"; // still in review, nobody confirmed it
  assert.equal(evaluateGroup(unconfirmedWrong).verdict, "clean");

  const lockedWrong = copy(base);
  lockedWrong.files[4].status = "done"; // already past review
  lockedWrong.files[4].title = lockedWrong.slots[0].title;
  assert.ok(checks(lockedWrong).includes("title_slot_mismatch"));

  const confirmedWrong = copy(base);
  confirmedWrong.files[4].confirmed = true;
  confirmedWrong.files[4].title = confirmedWrong.slots[0].title;
  const c = evaluateGroup(confirmedWrong).reasons;
  assert.ok(c.some((r) => r.check === "human_title_differs" && r.jobIds.includes(5)));
});

test("a confirmed or locked title that already equals the grouping's title is fine", () => {
  const d = buildDay(UNIQUE_SPLIT);
  d.files[2].confirmed = true;
  d.files[2].title = `${d.slots[2].title} | Part 1`;
  d.files[3].confirmed = true;
  d.files[3].title = `${d.slots[2].title} | Part 2`;
  const v = evaluateGroup(d);
  assert.equal(v.verdict, "clean");
  assert.ok(!v.titleChanges.some((c) => c.jobId === 3 || c.jobId === 4));
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

test("a collision is judged on the title the recording would get, not the machine's old proposal", () => {
  const d = buildDay(UNIQUE_SPLIT);
  // the part title is what recording 3 would get; another job already uses it
  d.otherTitles = [`${d.slots[2].title} | Part 1`];
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
  assert.ok(checks(d).includes("review_marker"));
});

test("a title a person confirmed that differs from the slot holds as a human conflict", () => {
  const d = copy(cleanDay);
  d.files[1].title = d.files[3].title; // a confirmed name that belongs to another slot
  d.files[1].confirmed = true;
  const r = evaluateGroup(d).reasons;
  assert.ok(r.some((x) => x.check === "human_title_differs" && x.jobIds.includes(d.files[1].id)));
  assert.ok(!r.some((x) => x.check === "title_slot_mismatch" && x.jobIds.includes(d.files[1].id)), "reported once, as the human conflict");
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

test("a missing length means the grouping cannot be searched", () => {
  const d = buildDay(UNIQUE_SPLIT);
  d.files[3].durationSec = null;
  const v = evaluateGroup(d);
  assert.equal(v.verdict, "hold");
  assert.equal(v.splitCount, null);
  assert.deepEqual(v.lectures, []);
});

test("a finished job from before sizes were recorded needs no size", () => {
  const d = copy(cleanDay);
  d.files[0].status = "done";
  d.files[0].sizeBytes = null;
  assert.equal(evaluateGroup(d).verdict, "clean");
  assert.equal(evaluateGroup(d).approvableJobIds.includes(d.files[0].id), false, "a done job is not approvable");
});

test("duplicates: same size or almost the same length", () => {
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

test("two locked titles that are the same are a duplicate, but a machine proposal repeating a title is not", () => {
  const locked = copy(cleanDay);
  locked.files[0].status = "done";
  locked.files[1].status = "done";
  locked.files[1].title = locked.files[0].title;
  assert.ok(checks(locked).includes("duplicate_suspected"));

  const proposals = buildDay(UNIQUE_SPLIT);
  proposals.files[6].title = proposals.files[0].title; // the fallback proposal for an extra recording repeats a slot's title
  assert.ok(!checks(proposals).includes("duplicate_suspected"));
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

test("a lecture far from its slot's start time holds", () => {
  const d = copy(cleanDay);
  const t = Date.parse(d.files[5].createdTime!) + 5 * 3600 * 1000; // five hours late
  d.files[5].createdTime = new Date(t).toISOString();
  assert.ok(checks(d).includes("timing_implausible"));
});

test("timing is judged on a lecture's first recording, not on a later part", () => {
  const d = buildDay(UNIQUE_SPLIT);
  assert.equal(evaluateGroup(d).verdict, "clean"); // the second part of lecture 3 starts later than its slot would allow on its own
  assert.ok(!checks(d).includes("timing_implausible"));
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

test("a long gap is not a skipped class when there are enough recordings", () => {
  const d = copy(cleanDay);
  // the clean day already has a 76 minute gap and one file per slot
  const gaps = d.files.slice(1).map((f, i) => (Date.parse(f.createdTime!) - Date.parse(d.files[i].createdTime!)) / 60000);
  assert.ok(Math.max(...gaps) > DEFAULT_CONFIG.maxGapBetweenRecordingsSec / 60);
  assert.equal(evaluateGroup(d).verdict, "clean");
});

// ── Purity and configuration ───────────────────────────────────────────────

test("it does not change its input and gives the same answer twice", () => {
  const d = buildDay(UNIQUE_SPLIT);
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
  const strict = { ...DEFAULT_CONFIG, maxDurationSec: 20 * 60 }; // no lecture can be 20+ minutes
  assert.ok(checks(cleanDay, strict).includes("no_valid_split"));
  const fewerParts = { ...DEFAULT_CONFIG, maxPartsPerLecture: 1 }; // a lecture is one recording
  assert.ok(checks(buildDay(UNIQUE_SPLIT), fewerParts).includes("no_valid_split"));
});
