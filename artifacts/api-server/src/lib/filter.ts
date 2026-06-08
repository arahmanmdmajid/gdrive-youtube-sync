import { extractMeetingCode } from "./schedule";

// Only files recorded from May 17 2026 onwards
export const CUTOFF_DATE = new Date("2026-05-16T19:00:00Z"); // midnight PKT May 17 = 19:00 UTC May 16

// Files over this size are likely batch recordings — still queued but flagged
export const BATCH_RECORDING_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB

// Meeting code → allowed days of week in PKT
export const MEETING_CODE_DAYS: Record<string, number[]> = {
  "uys-vqbk-mnn": [1, 2], // Monday, Tuesday
  "zeo-iaqz-qqu": [5, 6], // Friday, Saturday
};

const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

/**
 * Returns the human-readable reason a file is skipped, or null if it is eligible.
 * "Eligible" means the pipeline scan would queue it (subject to deduplication).
 */
export function getSkipReason(name: string, createdTime: string | null | undefined, sizeBytes?: number | null): string | null {
  const meetingCode = extractMeetingCode(name);
  if (!meetingCode) return "Unknown meeting code";

  if (!createdTime) return "Missing recording date";

  if (new Date(createdTime) <= CUTOFF_DATE) return "Before cutoff (pre May 17, 2026)";

  const pktDay = new Date(new Date(createdTime).getTime() + PKT_OFFSET_MS).getUTCDay();
  const allowedDays = MEETING_CODE_DAYS[meetingCode];
  if (allowedDays && !allowedDays.includes(pktDay)) {
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const allowedNames = allowedDays.map((d) => dayNames[d]).join("/");
    return `Wrong day (${dayNames[pktDay]}, expected ${allowedNames})`;
  }

  return null; // eligible
}

/** True if the file should be queued by the pipeline scan. */
export function isEligible(name: string, createdTime: string | null | undefined): boolean {
  return getSkipReason(name, createdTime) === null;
}
