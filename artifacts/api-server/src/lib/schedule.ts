import { db, scheduleSlotsTable } from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";

export interface ClassSlot {
  serial: string;
  subject: string;
  teacher: string;
  subjectEn: string;
  teacherEn: string;
}

function toClassSlot(row: typeof scheduleSlotsTable.$inferSelect): ClassSlot {
  return {
    serial: row.serial,
    subject: row.subjectAr,
    teacher: row.teacherAr,
    subjectEn: row.subjectEn,
    teacherEn: row.teacherEn,
  };
}

const PKT_OFFSET_HOURS = 5; // UTC+5

// Meeting code → allowed days of week (PKT)
// uys-vqbk-mnn = Monday (1) + Tuesday (2)
// zeo-iaqz-qqu = Friday (5) + Saturday (6)
export const MEETING_CODE_DAYS: Record<string, number[]> = {
  "uys-vqbk-mnn": [1, 2],
  "zeo-iaqz-qqu": [5, 6],
};

/**
 * Extracts the meeting code from a Drive filename (e.g. "uys-vqbk-mnn 2026-05-19…").
 */
export function extractMeetingCode(fileName: string): string | null {
  const lower = fileName.toLowerCase();
  for (const code of Object.keys(MEETING_CODE_DAYS)) {
    if (lower.startsWith(code)) return code;
  }
  return null;
}

/**
 * Resolves a class slot from a Drive ISO createdTime string, by rounding the
 * actual clock time to the nearest 30-min schedule slot.
 *
 * This is NOT the pipeline's primary naming path. runPipelineScan() assigns
 * slots positionally (by index within the day, not clock time) — see
 * pipeline.ts — because recordings can start late and a time-based lookup
 * would then match the wrong slot. This clock-time approach only runs as a
 * fallback for files that don't fit the positional grouping (overflow beyond
 * the day's schedule, or an unrecognized meeting code) via buildYoutubeTitle
 * below.
 *
 * Converts UTC → PKT, then looks up day-of-week + 30-min slot in the schedule.
 * Rounds the minutes to the nearest :00 or :30 boundary.
 * If meetingCode is supplied, only returns a match when the PKT day belongs to
 * that code's allowed days (uys-vqbk-mnn → Mon/Tue; zeo-iaqz-qqu → Fri/Sat).
 */
export async function resolveClassFromTime(isoTimestamp: string, meetingCode?: string | null): Promise<ClassSlot | null> {
  const utc = new Date(isoTimestamp);
  // Shift to PKT by adding offset as ms so we can use UTC getters
  const pktMs = utc.getTime() + PKT_OFFSET_HOURS * 60 * 60 * 1000;
  const pkt = new Date(pktMs);

  const dayOfWeek = pkt.getUTCDay(); // 0=Sun,1=Mon,2=Tue,5=Fri,6=Sat
  const hours = pkt.getUTCHours();
  const minutes = pkt.getUTCMinutes();

  // If a meeting code is given, reject days that don't belong to it
  if (meetingCode) {
    const allowedDays = MEETING_CODE_DAYS[meetingCode];
    if (allowedDays && !allowedDays.includes(dayOfWeek)) return null;
  }

  // Round to nearest 30-min slot
  const slotMinutes = minutes < 30 ? 0 : 30;
  const slotKey = `${String(hours).padStart(2, "0")}:${String(slotMinutes).padStart(2, "0")}`;

  const [row] = await db
    .select()
    .from(scheduleSlotsTable)
    .where(and(eq(scheduleSlotsTable.dayOfWeek, dayOfWeek), eq(scheduleSlotsTable.timeSlot, slotKey)));

  return row ? toClassSlot(row) : null;
}

/**
 * Returns a PKT date string (DD-MM-YYYY) from a Drive ISO createdTime.
 */
export function toPktDateStr(isoTimestamp: string): string {
  const utc = new Date(isoTimestamp);
  const pktMs = utc.getTime() + PKT_OFFSET_HOURS * 60 * 60 * 1000;
  const pkt = new Date(pktMs);
  const year = pkt.getUTCFullYear();
  const month = String(pkt.getUTCMonth() + 1).padStart(2, "0");
  const day = String(pkt.getUTCDate()).padStart(2, "0");
  return `${day}-${month}-${year}`;
}

/**
 * Returns the PKT date (DD-MM-YYYY) and day-of-week (0=Sun … 6=Sat)
 * for a Drive ISO timestamp.
 */
export function getPktInfo(isoTimestamp: string): { dateStr: string; dayOfWeek: number } {
  const utc = new Date(isoTimestamp);
  const pktMs = utc.getTime() + PKT_OFFSET_HOURS * 60 * 60 * 1000;
  const pkt = new Date(pktMs);
  const year = pkt.getUTCFullYear();
  const month = String(pkt.getUTCMonth() + 1).padStart(2, "0");
  const day = String(pkt.getUTCDate()).padStart(2, "0");
  return { dateStr: `${day}-${month}-${year}`, dayOfWeek: pkt.getUTCDay() };
}

/**
 * Returns the class slots for a given PKT day-of-week in chronological order.
 * Returns an empty array if the day has no schedule.
 */
export async function getOrderedSlotsForDay(dayOfWeek: number): Promise<ClassSlot[]> {
  const rows = await db
    .select()
    .from(scheduleSlotsTable)
    .where(eq(scheduleSlotsTable.dayOfWeek, dayOfWeek))
    .orderBy(asc(scheduleSlotsTable.timeSlot));
  return rows.map(toClassSlot);
}

/**
 * Builds a YouTube description from a resolved ClassSlot (used by positional naming).
 */
export function buildYoutubeTitleFromSlot(slot: ClassSlot, dateStr: string): string {
  const ltrPrefix = slot.serial ? `${slot.serial} ` : "";
  return `${ltrPrefix}${slot.subjectEn} | ${slot.teacherEn} | ${dateStr}`;
}

export function buildYoutubeDescriptionFromSlot(
  slot: ClassSlot,
  dateStr: string,
  fileName: string,
): string {
  return [
    `Subject: ${slot.subjectEn}`,
    `Teacher: ${slot.teacherEn}`,
    `Date: ${dateStr}`,
    `Source file: ${fileName}`,
    `Uploaded automatically by the class recording pipeline.`,
  ].join("\n");
}

export async function buildYoutubeTitle(fileName: string, createdTime: string | null | undefined): Promise<string> {
  if (createdTime) {
    const meetingCode = extractMeetingCode(fileName);
    const classInfo = await resolveClassFromTime(createdTime, meetingCode);
    if (classInfo) {
      const dateStr = toPktDateStr(createdTime);
      return buildYoutubeTitleFromSlot(classInfo, dateStr);
    }
  }
  return fileName.replace(/\.[^.]+$/, "");
}

export async function buildYoutubeDescription(fileName: string, createdTime: string | null | undefined): Promise<string> {
  const lines: string[] = [];
  if (createdTime) {
    const meetingCode = extractMeetingCode(fileName);
    const classInfo = await resolveClassFromTime(createdTime, meetingCode);
    if (classInfo) {
      lines.push(`Subject: ${classInfo.subjectEn}`);
      lines.push(`Teacher: ${classInfo.teacherEn}`);
    }
    const dateStr = toPktDateStr(createdTime);
    lines.push(`Date: ${dateStr}`);
  }
  lines.push(`Source file: ${fileName}`);
  lines.push(`Uploaded automatically by the class recording pipeline.`);
  return lines.join("\n");
}
