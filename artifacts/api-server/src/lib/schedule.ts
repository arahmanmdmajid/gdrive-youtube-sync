export interface ClassSlot {
  subject: string;
  teacher: string;
}

// Maps subject name → serial number prefix
const SUBJECT_SERIAL: Record<string, string> = {
  "جلالين اول":                       "1.1",
  "جلالين دوم":                       "1.2",
  "جلالين ثلث":                       "1.3",
  "الفوز الكبير":                     "2.1",
  "كتاب الآثار، خير الأصول":         "2.2",
  "سراجى":                            "2.3",
  "هداية ثاني حصہ اول":              "3.1",
  "هداية ثاني حصہ دوم":              "3.2",
  "هداية ثاني حصہ سوم":              "3.3",
  "توضيح اول":                        "4.1",
  "توضيح دوم":                        "4.2",
  "شرح عقائد":                        "5.1",
  "فلکیات":                           "5.2",
  "متن الكافي، الهيئة الصغرى":       "6.1",
  "ديوان حماسہ":                      "6.2",
};

type DaySchedule = {
  [timeSlot: string]: ClassSlot;
};

// Schedule times are in PKT (Pakistan Standard Time, UTC+5)
const SCHEDULE: Record<string, DaySchedule> = {
  // جمعہ - Friday (day 5)
  "5": {
    "18:00": { subject: "هداية ثاني حصہ اول", teacher: "م. سراج الحق صاحب" },
    "18:30": { subject: "جلالين اول", teacher: "م. فياض صاحب" },
    "19:00": { subject: "كتاب الآثار، خير الأصول", teacher: "م. حسيب صاحب" },
    "19:30": { subject: "جلالين ثلث", teacher: "م. وسيم الله صاحب" },
    "20:00": { subject: "توضيح اول", teacher: "م. عتيق الله صاحب" },
    "20:30": { subject: "هداية ثاني حصہ دوم", teacher: "م. سعيد الرحمن صاحب" },
    "21:00": { subject: "ديوان حماسہ", teacher: "م. فراز صاحب" },
    "21:30": { subject: "شرح عقائد", teacher: "م. خالد زمان صاحب" },
  },
  // ہفتہ - Saturday (day 6)
  "6": {
    "18:00": { subject: "جلالين اول", teacher: "م. فياض صاحب" },
    "18:30": { subject: "شرح عقائد", teacher: "م. خالد زمان صاحب" },
    "19:00": { subject: "جلالين ثلث", teacher: "م. وسيم الله صاحب" },
    "19:30": { subject: "كتاب الآثار، خير الأصول", teacher: "م. حسيب صاحب" },
    "20:00": { subject: "هداية ثاني حصہ اول", teacher: "م. سراج الحق صاحب" },
    "20:30": { subject: "توضيح اول", teacher: "م. عتيق الله صاحب" },
    "21:00": { subject: "ديوان حماسہ", teacher: "م. فراز صاحب" },
    "21:30": { subject: "هداية ثاني حصہ دوم", teacher: "م. سعيد الرحمن صاحب" },
  },
  // پیر - Monday (day 1)
  "1": {
    "18:00": { subject: "توضيح دوم", teacher: "م. سعيد الرحمن صاحب" },
    "18:30": { subject: "جلالين دوم", teacher: "م. حسيب صاحب" },
    "19:00": { subject: "متن الكافي، الهيئة الصغرى", teacher: "م. عامر اقبال صاحب" },
    "19:30": { subject: "سراجى", teacher: "م. خالد زمان صاحب" },
    "20:00": { subject: "الفوز الكبير", teacher: "م. حسيب صاحب" },
    "20:30": { subject: "هداية ثاني حصہ سوم", teacher: "م. اسلم شاہ صاحب" },
  },
  // منگل - Tuesday (day 2)
  "2": {
    "18:00": { subject: "توضيح دوم", teacher: "م. سعيد الرحمن صاحب" },
    "18:30": { subject: "متن الكافي، الهيئة الصغرى", teacher: "م. عامر اقبال صاحب" },
    "19:00": { subject: "جلالين دوم", teacher: "م. حسيب صاحب" },
    "19:30": { subject: "فلکیات", teacher: "م. خالد زمان صاحب" },
    "20:00": { subject: "الفوز الكبير", teacher: "م. حسيب صاحب" },
    "20:30": { subject: "هداية ثاني حصہ سوم", teacher: "م. اسلم شاہ صاحب" },
  },
};

const PKT_OFFSET_HOURS = 5; // UTC+5

// Meeting code → allowed days of week (PKT)
// uys-vqbk-mnn = Monday (1) + Tuesday (2)
// zeo-iaqz-qqu = Friday (5) + Saturday (6)
const MEETING_CODE_DAYS: Record<string, number[]> = {
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
 * Resolves a class slot from a Drive ISO createdTime string.
 * Converts UTC → PKT, then looks up day-of-week + 30-min slot in the schedule.
 * Rounds the minutes to the nearest :00 or :30 boundary.
 * If meetingCode is supplied, only returns a match when the PKT day belongs to
 * that code's allowed days (uys-vqbk-mnn → Mon/Tue; zeo-iaqz-qqu → Fri/Sat).
 */
export function resolveClassFromTime(isoTimestamp: string, meetingCode?: string | null): ClassSlot | null {
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

  const daySchedule = SCHEDULE[String(dayOfWeek)];
  if (!daySchedule) return null;

  return daySchedule[slotKey] ?? null;
}

/**
 * Returns a PKT date string (DD-MM-YYYY) from a Drive ISO createdTime.
 */
function toPktDateStr(isoTimestamp: string): string {
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
export function getOrderedSlotsForDay(dayOfWeek: number): ClassSlot[] {
  const daySchedule = SCHEDULE[String(dayOfWeek)];
  if (!daySchedule) return [];
  return Object.entries(daySchedule)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, slot]) => slot);
}

/**
 * Builds a YouTube description from a resolved ClassSlot (used by positional naming).
 */
export function buildYoutubeTitleFromSlot(slot: ClassSlot, dateStr: string): string {
  const serial = SUBJECT_SERIAL[slot.subject];
  const ltrPrefix = serial ? `${serial} | ${dateStr} | ` : `${dateStr} | `;
  return `${ltrPrefix}${slot.subject} | ${slot.teacher}`;
}

export function buildYoutubeDescriptionFromSlot(
  slot: ClassSlot,
  dateStr: string,
  fileName: string,
): string {
  return [
    `Subject: ${slot.subject}`,
    `Teacher: ${slot.teacher}`,
    `Date: ${dateStr}`,
    `Source file: ${fileName}`,
    `Uploaded automatically by the class recording pipeline.`,
  ].join("\n");
}

export function buildYoutubeTitle(fileName: string, createdTime: string | null | undefined): string {
  if (createdTime) {
    const meetingCode = extractMeetingCode(fileName);
    const classInfo = resolveClassFromTime(createdTime, meetingCode);
    if (classInfo) {
      const dateStr = toPktDateStr(createdTime);
      return buildYoutubeTitleFromSlot(classInfo, dateStr);
    }
  }
  return fileName.replace(/\.[^.]+$/, "");
}

export function buildYoutubeDescription(fileName: string, createdTime: string | null | undefined): string {
  const lines: string[] = [];
  if (createdTime) {
    const meetingCode = extractMeetingCode(fileName);
    const classInfo = resolveClassFromTime(createdTime, meetingCode);
    if (classInfo) {
      lines.push(`Subject: ${classInfo.subject}`);
      lines.push(`Teacher: ${classInfo.teacher}`);
    }
    const dateStr = toPktDateStr(createdTime);
    lines.push(`Date: ${dateStr}`);
  }
  lines.push(`Source file: ${fileName}`);
  lines.push(`Uploaded automatically by the class recording pipeline.`);
  return lines.join("\n");
}
