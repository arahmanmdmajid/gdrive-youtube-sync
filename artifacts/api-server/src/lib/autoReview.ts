// The rules that decide whether one day's recordings are safe to approve without a person looking.
//
// Pure on purpose: no database, Drive, YouTube or network access and no imports, so it can be tested
// with plain data and replayed over old days. It only returns a verdict. It never approves, rejects
// or uploads anything.
//
// A group is clean only if EVERY check passes. Anything uncertain, conflicting or missing holds the
// whole group, with a named reason for each failed check. Missing evidence is never read as success.
// See issue #27 for the plan and #36 for this stage.

export const RULE_VERSION = "1";

const MIN = 60;
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000; // PKT is UTC+5, the same shift schedule.ts uses

/**
 * Thresholds. Candidates taken from one sample of 54 approved recordings (see #27), to be tuned in
 * shadow mode. They are not final values and have not been tested on later weeks.
 */
export interface ReviewConfig {
  /** Under this a recording is "short": it holds the whole group and a person decides. */
  shortRecordingSec: number;
  /** Normal lecture length. Done videos in the sample: 5th percentile 7.5 min, maximum 51 min. */
  minDurationSec: number;
  maxDurationSec: number;
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
  /** How far a recording's estimated start may be before / after its slot's start. Late starts are common (median 35 min). */
  startEarlyToleranceSec: number;
  startLateToleranceSec: number;
}

export const DEFAULT_CONFIG: ReviewConfig = {
  shortRecordingSec: 5 * MIN,
  minDurationSec: 7 * MIN,
  maxDurationSec: 55 * MIN,
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
  | "duration_out_of_band"
  | "split_suspected"
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

export interface Verdict {
  verdict: "clean" | "hold";
  reasons: Reason[];
  /** The needs_review jobs that would be approved. Empty unless the verdict is clean. */
  approvableJobIds: number[];
  ruleVersion: string;
}

const PART_SUFFIX = /\|\s*Part\s+\d+\s*$/i;

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

export function evaluateGroup(input: GroupInput, config: ReviewConfig = DEFAULT_CONFIG): Verdict {
  const reasons: Reason[] = [];
  const add = (check: CheckId, jobIds: number[], message: string) => reasons.push({ check, jobIds, message });
  const finish = (): Verdict => ({
    verdict: reasons.length === 0 ? "clean" : "hold",
    reasons,
    approvableJobIds: reasons.length === 0 ? files.filter((f) => f.status === "needs_review").map((f) => f.id) : [],
    ruleVersion: RULE_VERSION,
  });

  // Rejected files do not count. Every other file counts, whatever its length. Work on a copy.
  const files = input.files
    .filter((f) => f.status !== "rejected")
    .sort((a, b) => (a.createdTime ?? "").localeCompare(b.createdTime ?? "") || a.id - b.id);

  if (files.length === 0) {
    add("no_files", [], "The group has no non-rejected recordings to evaluate.");
    return finish();
  }

  // ── 1. Group identity ────────────────────────────────────────────────────
  const dayStart = parseDate(input.date);
  if (!input.meetingCode) add("group_identity", [], "The meeting code is unknown.");
  if (dayStart === null) add("group_identity", [], `The group date "${input.date}" is not DD-MM-YYYY.`);
  const wrongDay = files.filter((f) => f.createdTime && pktDate(f.createdTime) !== input.date).map((f) => f.id);
  if (wrongDay.length) add("group_identity", wrongDay, "Recordings from another PKT date are in this group.");

  const audio = files.filter((f) => f.contentType === "audio").map((f) => f.id);
  if (audio.length) add("not_video", audio, "Audio jobs have no schedule slots and cannot be evaluated here.");

  // ── 9. Missing evidence (collected up front, the other checks skip what they cannot read) ──
  const noTime = files.filter((f) => !f.createdTime).map((f) => f.id);
  const noDuration = files.filter((f) => f.durationSec == null).map((f) => f.id);
  const noTitle = files.filter((f) => !f.title || !f.title.trim()).map((f) => f.id);
  // Finished jobs from before the size was recorded do not need one to be judged.
  const noSize = files.filter((f) => f.sizeBytes == null && f.status !== "done" && f.status !== "removed").map((f) => f.id);
  if (noTime.length) add("missing_evidence", noTime, "Recording time is missing.");
  if (noDuration.length) add("missing_evidence", noDuration, "Duration is missing.");
  if (noTitle.length) add("missing_evidence", noTitle, "Title is missing.");
  if (noSize.length) add("missing_evidence", noSize, "File size is missing.");

  // ── 2. Count ─────────────────────────────────────────────────────────────
  if (input.slots.length === 0) {
    add("no_schedule", [], "There are no schedule slots for this day.");
  } else if (files.length !== input.slots.length) {
    add("count_mismatch", [], `${files.length} recordings for ${input.slots.length} schedule slots.`);
  }

  // ── 3 and 4. Duration, short recordings ──────────────────────────────────
  const short = files.filter((f) => f.durationSec != null && f.durationSec < config.shortRecordingSec).map((f) => f.id);
  if (short.length) {
    add("short_recording", short, "A recording under 5 minutes could change the assignment. Only a person rejects it.");
  }
  const outOfBand = files
    .filter((f) => f.durationSec != null && f.durationSec >= config.shortRecordingSec && (f.durationSec < config.minDurationSec || f.durationSec > config.maxDurationSec))
    .map((f) => f.id);
  if (outOfBand.length) add("duration_out_of_band", outOfBand, "Duration is outside the normal lecture length.");

  // ── 5. Splits and duplicates ─────────────────────────────────────────────
  const parts = files.filter((f) => f.title && PART_SUFFIX.test(f.title)).map((f) => f.id);
  if (parts.length) add("split_suspected", parts, 'A title has a "Part N" suffix, so a lecture was split or merged.');

  const dupIds = new Set<number>();
  for (let i = 0; i < files.length; i++) {
    for (let j = i + 1; j < files.length; j++) {
      const a = files[i];
      const b = files[j];
      const sameTitle = !!a.title && a.title === b.title;
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

  // ── 6. Order and timing ──────────────────────────────────────────────────
  // End times are Drive createdTime. A recording's estimated start is its end minus its length.
  const overlap: number[] = [];
  const skipped: number[] = [];
  const backwards: number[] = [];
  for (let i = 1; i < files.length; i++) {
    const prev = files[i - 1];
    const cur = files[i];
    if (!prev.createdTime || !cur.createdTime) continue;
    const gapSec = (Date.parse(cur.createdTime) - Date.parse(prev.createdTime)) / 1000;
    // A long gap only means a skipped class when a slot is missing. With one file per slot it is a late class.
    if (files.length < input.slots.length && gapSec > config.maxGapBetweenRecordingsSec) skipped.push(prev.id, cur.id);
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

  // Positional checks only mean something when there is one slot per file.
  if (input.slots.length > 0 && files.length === input.slots.length) {
    const mismatched: number[] = [];
    const humanDiffers: number[] = [];
    files.forEach((f, i) => {
      if (!f.title) return;
      if (f.title === input.slots[i].title) return;
      (f.confirmed ? humanDiffers : mismatched).push(f.id);
    });
    if (humanDiffers.length) {
      add("human_title_differs", humanDiffers, "A title a person confirmed differs from the schedule slot at its position.");
    }
    if (mismatched.length) {
      const titles = new Set(files.map((f) => f.title));
      const sameSet = input.slots.every((s) => titles.has(s.title));
      add(
        "title_slot_mismatch",
        mismatched,
        sameSet ? "The titles are the day's slots but in a different order." : "A title does not match the schedule slot at its position.",
      );
    }

    if (dayStart !== null) {
      const implausible: number[] = [];
      files.forEach((f, i) => {
        if (!f.createdTime || f.durationSec == null) return;
        const slotMin = slotMinutes(input.slots[i].startTime);
        if (slotMin === null) return;
        const startSecOfDay = (Date.parse(f.createdTime) + PKT_OFFSET_MS - dayStart) / 1000 - f.durationSec;
        const diffSec = startSecOfDay - slotMin * 60;
        if (diffSec < -config.startEarlyToleranceSec || diffSec > config.startLateToleranceSec) implausible.push(f.id);
      });
      if (implausible.length) add("timing_implausible", implausible, "A recording's estimated start is far from its slot's start time.");
    }
  }

  // ── 7. Safeguards ────────────────────────────────────────────────────────
  const big = files.filter((f) => f.sizeBytes != null && f.sizeBytes > config.maxFileBytes).map((f) => f.id);
  if (big.length) add("oversized_file", big, "A file over 500 MB is likely a batch recording.");
  // The scan prefixes a large file's title with "[REVIEW: large file]".
  const flagged = files.filter((f) => f.title && f.title.includes("[REVIEW")).map((f) => f.id);
  if (flagged.length) add("review_marker", flagged, "A title carries a [REVIEW...] marker added by the scan.");
  if (input.date === input.today) add("group_dated_today", [], "The group is dated today and a recording may still be in progress.");
  const others = new Set(input.otherTitles);
  const collide = files.filter((f) => f.title && others.has(f.title)).map((f) => f.id);
  if (collide.length) add("title_collision", collide, "A title is already used by another job outside this group.");

  return finish();
}
