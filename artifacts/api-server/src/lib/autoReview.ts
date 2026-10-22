// The rules that decide whether one day's recordings are safe to approve without a person looking.
//
// Pure on purpose: no database, Drive, YouTube or network access and no imports, so it can be tested
// with plain data and replayed over old days. It only returns a verdict. It never approves, rejects
// or uploads anything.
//
// A lecture is often cut by a break into two or more recordings (Part 1, Part 2). So the rules do not
// count recordings against slots: they search for how the day's recordings, in time order, group into
// exactly as many lectures as there are slots, each of a normal combined length. A day can be clean only
// if exactly one grouping works. Anything uncertain, conflicting or missing holds the whole day, with a
// named reason for each failed check. Missing evidence is never read as success.
// See issue #27 for the plan, #36 for the first version and #40 for the split-aware version.

export const RULE_VERSION = "2";

const MIN = 60;
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000; // PKT is UTC+5, the same shift schedule.ts uses

/**
 * Thresholds. Candidates taken from one sample of 54 approved recordings (see #27), to be tuned in
 * shadow mode. They are not final values and have not been tested on later weeks.
 */
export interface ReviewConfig {
  /** Under this a recording is "short": it holds the whole day and a person decides (junk, or a real part). */
  shortRecordingSec: number;
  /** Normal length of a LECTURE (all its parts together). Done videos in the sample: 5th percentile 7.5 min, maximum 51 min. */
  minDurationSec: number;
  maxDurationSec: number;
  /** A lecture is not made of more recordings than this. */
  maxPartsPerLecture: number;
  /** Stop looking for more valid groupings after this many (the day is ambiguous long before). */
  splitSearchCap: number;
  /** How many alternative groupings to list on an ambiguous day. */
  alternativesListed: number;
  /** Larger files are likely batch recordings (same limit as BATCH_RECORDING_SIZE_BYTES in filter.ts). */
  maxFileBytes: number;
  /** Two recordings this close in length are suspected duplicates. */
  duplicateDurationToleranceSec: number;
  /**
   * A recording may seem to start this much before the previous one ended before it counts as overlapping.
   * Drive's createdTime includes variable processing delay, so (createdTime minus duration) is only a rough
   * start. In the sample 25% of consecutive pairs showed over 5 minutes of apparent overlap and 10% over 15,
   * almost all of it noise, so only a gross overlap is evidence of two recordings at the same time.
   */
  overlapToleranceSec: number;
  /** With fewer recordings than slots, a larger gap between consecutive end times points at the skipped class (done files: 90th percentile 62 min). */
  maxGapBetweenRecordingsSec: number;
  /** How far a lecture's estimated start may be before / after its slot's start. Late starts are common (median 35 min). */
  startEarlyToleranceSec: number;
  startLateToleranceSec: number;
}

export const DEFAULT_CONFIG: ReviewConfig = {
  shortRecordingSec: 5 * MIN,
  minDurationSec: 7 * MIN,
  maxDurationSec: 55 * MIN,
  maxPartsPerLecture: 5,
  splitSearchCap: 200,
  alternativesListed: 3,
  maxFileBytes: 500 * 1024 * 1024,
  duplicateDurationToleranceSec: 3,
  overlapToleranceSec: 20 * MIN,
  maxGapBetweenRecordingsSec: 75 * MIN,
  startEarlyToleranceSec: 45 * MIN,
  startLateToleranceSec: 150 * MIN,
};

export interface GroupFile {
  id: number;
  /** needs_review, pending, processing, done, failed, removed or rejected. Rejected files are ignored. */
  status: string;
  /** The job's current proposed title (or its YouTube title for a finished job). */
  title: string | null;
  /** True once a person confirmed the lecture name. */
  confirmed: boolean;
  /** Drive createdTime as an ISO string. */
  createdTime: string | null;
  durationSec: number | null;
  sizeBytes: number | null;
  contentType?: "video" | "audio";
}

export interface GroupSlot {
  /** The expected title, built the way the pipeline builds it from the slot and the date. */
  title: string;
  /** Slot start in PKT as "HH:MM". */
  startTime: string;
}

export interface GroupInput {
  /** PKT date of the group as DD-MM-YYYY. */
  date: string;
  meetingCode: string | null;
  /** Every job of this day and meeting code, in any order. */
  files: GroupFile[];
  /** That day's schedule slots in time order. */
  slots: GroupSlot[];
  /** Today in PKT as DD-MM-YYYY. A group dated today may still be recording. */
  today: string;
  /** Titles of non-rejected jobs outside this group, to detect a collision. */
  otherTitles: string[];
}

export type CheckId =
  | "no_files"
  | "group_identity"
  | "not_video"
  | "missing_evidence"
  | "no_schedule"
  | "count_mismatch"
  | "short_recording"
  | "no_valid_split"
  | "ambiguous_split"
  | "duplicate_suspected"
  | "recordings_overlap"
  | "start_order"
  | "possible_skipped_class"
  | "timing_implausible"
  | "title_slot_mismatch"
  | "human_title_differs"
  | "oversized_file"
  | "review_marker"
  | "group_dated_today"
  | "title_collision";

export interface Reason {
  check: CheckId;
  /** The jobs the reason is about. Empty when it is about the whole group. */
  jobIds: number[];
  message: string;
}

/** One lecture of the day: the slot it fills and the recordings (parts) that make it up, in order. */
export interface Lecture {
  slotIndex: number;
  slotTitle: string;
  jobIds: number[];
  /** The title each recording gets: the slot's title, or with " | Part 1", " | Part 2" ... for several recordings. */
  titles: { jobId: number; title: string }[];
}

/** A job still in review whose title would change to match the grouping. */
export interface TitleChange {
  jobId: number;
  from: string | null;
  to: string;
}

/** How many valid groupings exist when a short recording is read as junk and as a real part. */
export interface SplitReading {
  reading: "as_junk" | "as_part";
  validSplits: number;
  /** True if the search stopped at the cap, so the real number is larger. */
  capped: boolean;
}

export interface Verdict {
  verdict: "clean" | "hold";
  reasons: Reason[];
  /** The needs_review jobs that would be approved. Empty unless the verdict is clean. */
  approvableJobIds: number[];
  ruleVersion: string;
  /** Number of valid groupings found (null when the search could not run). Exactly 1 is needed for a clean day. */
  splitCount: number | null;
  /** The grouping, when exactly one exists and no short recording makes it uncertain. */
  lectures: Lecture[];
  /** Titles in review that would change to match the grouping. Only with a single grouping. */
  titleChanges: TitleChange[];
  /** Both readings of a short recording. Empty when there is none. */
  readings: SplitReading[];
  /** Up to a few alternative groupings (as lists of job ids per lecture) on an ambiguous day. */
  alternatives: number[][][];
}

function parseDate(ddmmyyyy: string): number | null {
  const m = ddmmyyyy.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return m ? Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
}

function pktDate(iso: string): string {
  const d = new Date(Date.parse(iso) + PKT_OFFSET_MS);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getUTCFullYear()}`;
}

function slotMinutes(hhmm: string): number | null {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * Every way to cut the recordings (given as their lengths, in time order) into exactly `lectures`
 * consecutive lectures where each lecture's total length is in the normal band and it has at most
 * `maxPartsPerLecture` recordings. Each result lists the index where each lecture ends (exclusive).
 */
export function findSplits(durations: number[], lectures: number, config: ReviewConfig): { splits: number[][]; capped: boolean } {
  const n = durations.length;
  const splits: number[][] = [];
  let capped = false;
  const total = (from: number, to: number) => {
    let s = 0;
    for (let i = from; i < to; i++) s += durations[i];
    return s;
  };
  const inBand = (sum: number) => sum >= config.minDurationSec && sum <= config.maxDurationSec;
  const walk = (start: number, left: number, ends: number[]) => {
    if (capped) return;
    if (left === 1) {
      if (start < n && n - start <= config.maxPartsPerLecture && inBand(total(start, n))) {
        if (splits.length >= config.splitSearchCap) capped = true;
        else splits.push([...ends, n]);
      }
      return;
    }
    let sum = 0;
    for (let end = start + 1; end <= n - (left - 1); end++) {
      if (end - start > config.maxPartsPerLecture) break;
      sum += durations[end - 1];
      if (sum > config.maxDurationSec) break;
      if (inBand(sum)) walk(end, left - 1, [...ends, end]);
    }
  };
  if (lectures >= 1 && n >= lectures) walk(0, lectures, []);
  return { splits, capped };
}

export function evaluateGroup(input: GroupInput, config: ReviewConfig = DEFAULT_CONFIG): Verdict {
  const reasons: Reason[] = [];
  const add = (check: CheckId, jobIds: number[], message: string) => reasons.push({ check, jobIds, message });

  let splitCount: number | null = null;
  const lectures: Lecture[] = [];
  const titleChanges: TitleChange[] = [];
  let readings: SplitReading[] = [];
  let alternatives: number[][][] = [];

  const finish = (): Verdict => ({
    verdict: reasons.length === 0 ? "clean" : "hold",
    reasons,
    approvableJobIds: reasons.length === 0 ? files.filter((f) => f.status === "needs_review").map((f) => f.id) : [],
    ruleVersion: RULE_VERSION,
    splitCount,
    lectures,
    titleChanges,
    readings,
    alternatives,
  });

  // Rejected files do not count. Every other file counts, whatever its length. Work on a copy.
  const files = input.files
    .filter((f) => f.status !== "rejected")
    .sort((a, b) => (a.createdTime ?? "").localeCompare(b.createdTime ?? "") || a.id - b.id);

  if (files.length === 0) {
    add("no_files", [], "The group has no non-rejected recordings to evaluate.");
    return finish();
  }

  // A title is "locked" when a person confirmed it or the job is already past review. A title on a job
  // still in review that nobody confirmed is the machine's proposal (the scan assigns slots by position
  // and knows nothing about breaks), so it is not evidence and is replaced by the grouping's title.
  const locked = (f: GroupFile) => f.confirmed || f.status !== "needs_review";

  // ── Group identity ───────────────────────────────────────────────────────
  const dayStart = parseDate(input.date);
  if (!input.meetingCode) add("group_identity", [], "The meeting code is unknown.");
  if (dayStart === null) add("group_identity", [], `The group date "${input.date}" is not DD-MM-YYYY.`);
  const wrongDay = files.filter((f) => f.createdTime && pktDate(f.createdTime) !== input.date).map((f) => f.id);
  if (wrongDay.length) add("group_identity", wrongDay, "Recordings from another PKT date are in this group.");

  const audio = files.filter((f) => f.contentType === "audio").map((f) => f.id);
  if (audio.length) add("not_video", audio, "Audio jobs have no schedule slots and cannot be evaluated here.");

  // ── Missing evidence (collected up front, the other checks skip what they cannot read) ──
  const noTime = files.filter((f) => !f.createdTime).map((f) => f.id);
  const noDuration = files.filter((f) => f.durationSec == null).map((f) => f.id);
  const noTitle = files.filter((f) => !f.title || !f.title.trim()).map((f) => f.id);
  // Finished jobs from before the size was recorded do not need one to be judged.
  const noSize = files.filter((f) => f.sizeBytes == null && f.status !== "done" && f.status !== "removed").map((f) => f.id);
  if (noTime.length) add("missing_evidence", noTime, "Recording time is missing.");
  if (noDuration.length) add("missing_evidence", noDuration, "Duration is missing.");
  if (noTitle.length) add("missing_evidence", noTitle, "Title is missing.");
  if (noSize.length) add("missing_evidence", noSize, "File size is missing.");

  // ── Short recordings: junk or a real part? The day holds and both readings are shown. ──
  const short = files.filter((f) => f.durationSec != null && f.durationSec < config.shortRecordingSec).map((f) => f.id);

  // ── The grouping into lectures ───────────────────────────────────────────
  const slotCount = input.slots.length;
  let unique: number[] | null = null; // lecture end indexes into `files`, when exactly one grouping exists
  if (slotCount === 0) {
    add("no_schedule", [], "There are no schedule slots for this day.");
  } else if (files.length < slotCount) {
    add("count_mismatch", [], `${files.length} recordings for ${slotCount} schedule slots: fewer recordings than lectures.`);
  } else if (noDuration.length === 0) {
    const durations = files.map((f) => f.durationSec as number);
    const asPart = findSplits(durations, slotCount, config);
    splitCount = asPart.splits.length;
    if (short.length) {
      const keptIdx = files.map((f, i) => (f.durationSec! < config.shortRecordingSec ? -1 : i)).filter((i) => i >= 0);
      const asJunk = findSplits(keptIdx.map((i) => durations[i]), slotCount, config);
      readings = [
        { reading: "as_junk", validSplits: asJunk.splits.length, capped: asJunk.capped },
        { reading: "as_part", validSplits: asPart.splits.length, capped: asPart.capped },
      ];
    } else if (asPart.splits.length === 0) {
      add("no_valid_split", [], `The ${files.length} recordings cannot be grouped into ${slotCount} lectures of normal length.`);
    } else if (asPart.splits.length > 1) {
      const toJobIds = (ends: number[]) => ends.map((end, i) => files.slice(i === 0 ? 0 : ends[i - 1], end).map((f) => f.id));
      alternatives = asPart.splits.slice(0, config.alternativesListed).map(toJobIds);
      add(
        "ambiguous_split",
        [],
        `${asPart.splits.length}${asPart.capped ? "+" : ""} different ways to group the ${files.length} recordings into ${slotCount} lectures; the first ${alternatives.length} are listed.`,
      );
    } else {
      unique = asPart.splits[0];
    }
  }
  if (short.length) {
    const n = (r: SplitReading) => `${r.validSplits}${r.capped ? "+" : ""}`;
    const r = readings.length
      ? ` Read as junk there ${readings[0].validSplits === 1 ? "is 1 valid grouping" : `are ${n(readings[0])} valid groupings`}; read as a real part, ${n(readings[1])}.`
      : "";
    add("short_recording", short, `A recording under 5 minutes is either junk or a real part, and only a person decides.${r}`);
  }

  // ── Titles ───────────────────────────────────────────────────────────────
  // With one grouping, every recording has a title it should get. A locked title that differs holds the
  // day; an unconfirmed title in review is only listed as a change.
  const computed = new Map<number, string>();
  if (unique) {
    let from = 0;
    unique.forEach((end, i) => {
      const group = files.slice(from, end);
      const slotTitle = input.slots[i].title;
      const titles = group.map((f, k) => ({ jobId: f.id, title: group.length === 1 ? slotTitle : `${slotTitle} | Part ${k + 1}` }));
      titles.forEach((t) => computed.set(t.jobId, t.title));
      lectures.push({ slotIndex: i, slotTitle, jobIds: group.map((f) => f.id), titles });
      from = end;
    });

    const slotTitles = new Set(input.slots.map((s) => s.title));
    const mismatched: number[] = [];
    const humanDiffers: number[] = [];
    for (const f of files) {
      const want = computed.get(f.id)!;
      if (f.title === want) continue;
      if (locked(f)) (f.confirmed ? humanDiffers : mismatched).push(f.id);
      else titleChanges.push({ jobId: f.id, from: f.title, to: want });
    }
    if (humanDiffers.length) {
      add("human_title_differs", humanDiffers, "A title a person confirmed differs from the title this grouping gives it.");
    }
    if (mismatched.length) {
      const outOfOrder = mismatched.every((id) => slotTitles.has(files.find((f) => f.id === id)!.title ?? ""));
      add(
        "title_slot_mismatch",
        mismatched,
        outOfOrder ? "The titles are the day's slots but in a different order." : "A title does not match the lecture its recording belongs to.",
      );
    }
  }

  // ── Duplicates ───────────────────────────────────────────────────────────
  // A shared title only counts between locked titles: the machine's proposals for the extra recordings
  // of a split day can repeat a slot's title by accident.
  const dupIds = new Set<number>();
  for (let i = 0; i < files.length; i++) {
    for (let j = i + 1; j < files.length; j++) {
      const a = files[i];
      const b = files[j];
      const sameTitle = !!a.title && a.title === b.title && locked(a) && locked(b);
      const sameSize = a.sizeBytes != null && a.sizeBytes > 0 && a.sizeBytes === b.sizeBytes;
      const closeLength =
        a.durationSec != null && b.durationSec != null && Math.abs(a.durationSec - b.durationSec) <= config.duplicateDurationToleranceSec;
      if (sameTitle || sameSize || closeLength) {
        dupIds.add(a.id);
        dupIds.add(b.id);
      }
    }
  }
  if (dupIds.size) add("duplicate_suspected", [...dupIds], "Two recordings share a title, a size or almost the same length.");

  // ── Order and timing ─────────────────────────────────────────────────────
  // End times are Drive createdTime. A recording's estimated start is its end minus its length.
  const overlap: number[] = [];
  const skipped: number[] = [];
  const backwards: number[] = [];
  for (let i = 1; i < files.length; i++) {
    const prev = files[i - 1];
    const cur = files[i];
    if (!prev.createdTime || !cur.createdTime) continue;
    const gapSec = (Date.parse(cur.createdTime) - Date.parse(prev.createdTime)) / 1000;
    // A long gap only means a skipped class when a slot is missing. With enough recordings it is a late class or a break.
    if (files.length < slotCount && gapSec > config.maxGapBetweenRecordingsSec) skipped.push(prev.id, cur.id);
    if (prev.durationSec != null && cur.durationSec != null) {
      const prevStart = Date.parse(prev.createdTime) - prev.durationSec * 1000;
      const curStart = Date.parse(cur.createdTime) - cur.durationSec * 1000;
      const tolMs = config.overlapToleranceSec * 1000;
      // One recording started well before the previous one ended: they ran at the same time.
      if (curStart < Date.parse(prev.createdTime) - tolMs) overlap.push(prev.id, cur.id);
      // A recording that ended later but started well before the previous one: order is not what it seems.
      if (curStart < prevStart - tolMs) backwards.push(prev.id, cur.id);
    }
  }
  if (overlap.length) add("recordings_overlap", [...new Set(overlap)], "Two recordings ran at the same time (one started before the previous one ended).");
  if (skipped.length) add("possible_skipped_class", [...new Set(skipped)], "A long gap between two recordings may be a skipped class.");
  if (backwards.length) add("start_order", [...new Set(backwards)], "Recording start times do not follow the creation order.");

  // A lecture's first recording should start near its slot.
  if (unique && dayStart !== null) {
    const implausible: number[] = [];
    lectures.forEach((lec, i) => {
      const first = files.find((f) => f.id === lec.jobIds[0])!;
      if (!first.createdTime || first.durationSec == null) return;
      const slotMin = slotMinutes(input.slots[i].startTime);
      if (slotMin === null) return;
      const startSecOfDay = (Date.parse(first.createdTime) + PKT_OFFSET_MS - dayStart) / 1000 - first.durationSec;
      const diffSec = startSecOfDay - slotMin * 60;
      if (diffSec < -config.startEarlyToleranceSec || diffSec > config.startLateToleranceSec) implausible.push(first.id);
    });
    if (implausible.length) add("timing_implausible", implausible, "A lecture's first recording starts far from its slot's start time.");
  }

  // ── Safeguards ───────────────────────────────────────────────────────────
  const big = files.filter((f) => f.sizeBytes != null && f.sizeBytes > config.maxFileBytes).map((f) => f.id);
  if (big.length) add("oversized_file", big, "A file over 500 MB is likely a batch recording.");
  // The scan prefixes a large file's title with "[REVIEW: large file]".
  const flagged = files.filter((f) => f.title && f.title.includes("[REVIEW")).map((f) => f.id);
  if (flagged.length) add("review_marker", flagged, "A title carries a [REVIEW...] marker added by the scan.");
  if (input.date === input.today) add("group_dated_today", [], "The group is dated today and a recording may still be in progress.");
  // The title that would be used: the grouping's for an unconfirmed proposal, the current one otherwise.
  const others = new Set(input.otherTitles);
  const collide = files
    .filter((f) => {
      const t = !locked(f) && computed.has(f.id) ? computed.get(f.id)! : f.title;
      return !!t && others.has(t);
    })
    .map((f) => f.id);
  if (collide.length) add("title_collision", collide, "A title is already used by another job outside this group.");

  return finish();
}
