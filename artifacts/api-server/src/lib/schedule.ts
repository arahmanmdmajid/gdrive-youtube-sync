export interface ClassSlot {
  subject: string;
  teacher: string;
}

type DaySchedule = {
  [timeSlot: string]: ClassSlot;
};

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

// PKT = UTC+5
const CLASS_TIMEZONE_OFFSET_HOURS = 5;

/**
 * Google Meet recordings are named like:
 *   "meeting-code (2026-05-22 17:52 GMT+5)"
 * The timestamp in the filename is when the recording started in PKT.
 * We use this for schedule matching — NOT the Drive createdTime which is when
 * the file was saved (often hours later or the next day).
 */
function extractFilenameTimestamp(fileName: string): Date | null {
  // Match pattern: (YYYY-MM-DD HH:MM GMT+5)
  const match = fileName.match(/\((\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) GMT\+5\)/);
  if (!match) return null;
  // Parse as PKT time
  return new Date(`${match[1]}T${match[2]}:00+05:00`);
}

/**
 * Resolves a class slot from a UTC Date that represents a PKT recording start.
 * We extract the PKT wall-clock time using UTC getters + manual offset since
 * the server runs in UTC and JS Date.getDay()/getHours() would return UTC values.
 */
function resolveClassFromDate(utcDate: Date): ClassSlot | null {
  // Shift the date object by +5h so UTC getters give us PKT wall-clock values
  const pktMs = utcDate.getTime() + CLASS_TIMEZONE_OFFSET_HOURS * 60 * 60 * 1000;
  const pkt = new Date(pktMs);

  const dayOfWeek = pkt.getUTCDay(); // 0=Sun, 1=Mon, 2=Tue, 5=Fri, 6=Sat
  const hours = pkt.getUTCHours();
  const minutes = pkt.getUTCMinutes();

  // Classes run 18:00–22:00 PKT.
  // Recordings often start a few minutes early (e.g. 17:43, 17:52).
  // Round up to the next :00 or :30 boundary if within 20 min before it.
  let slotHours = hours;
  let slotMinutes: number;

  // Recordings often start 5–25 minutes before the class slot.
  // We round UP to the nearest :00 or :30 if within 25 minutes of it.
  if (minutes === 0 || minutes === 30) {
    // Exactly on a boundary
    slotMinutes = minutes;
  } else if (minutes < 30) {
    if (minutes >= 5) {
      // 17:05–17:29 → round up to 17:30
      slotMinutes = 30;
    } else {
      // 17:00–17:04 → round down to 17:00
      slotMinutes = 0;
    }
  } else {
    if (minutes >= 35) {
      // 17:35–17:59 → round up to 18:00
      slotMinutes = 0;
      slotHours = hours + 1;
    } else {
      // 17:30–17:34 → keep at 17:30
      slotMinutes = 30;
    }
  }

  const slotKey = `${String(slotHours).padStart(2, "0")}:${String(slotMinutes).padStart(2, "0")}`;
  const daySchedule = SCHEDULE[String(dayOfWeek)];
  if (!daySchedule) return null;

  return daySchedule[slotKey] ?? null;
}

/**
 * Resolves class info from a Drive ISO timestamp (fallback only).
 * Less reliable than filename-based resolution.
 */
export function resolveClassFromTime(isoTimestamp: string): ClassSlot | null {
  const date = new Date(isoTimestamp);
  // Convert UTC to PKT
  const pktMs = date.getTime() + CLASS_TIMEZONE_OFFSET_HOURS * 60 * 60 * 1000;
  const pktDate = new Date(pktMs);
  // Use UTC getters since we manually shifted
  const dayOfWeek = pktDate.getUTCDay();
  const hours = pktDate.getUTCHours();
  const minutes = pktDate.getUTCMinutes();
  const slotMinutes = minutes < 30 ? 0 : 30;
  const slotKey = `${String(hours).padStart(2, "0")}:${String(slotMinutes).padStart(2, "0")}`;
  const daySchedule = SCHEDULE[String(dayOfWeek)];
  if (!daySchedule) return null;
  return daySchedule[slotKey] ?? null;
}

export function buildYoutubeTitle(fileName: string, createdTime: string | null | undefined): string {
  // First: try to parse from filename (most accurate — uses PKT recording start time)
  const filenameDate = extractFilenameTimestamp(fileName);
  if (filenameDate) {
    const classInfo = resolveClassFromDate(filenameDate);
    if (classInfo) {
      const dateStr = filenameDate.toISOString().slice(0, 10);
      return `${classInfo.subject} | ${classInfo.teacher} | ${dateStr}`;
    }
  }

  // Fallback: try Drive createdTime
  if (createdTime) {
    const classInfo = resolveClassFromTime(createdTime);
    if (classInfo) {
      const date = new Date(createdTime);
      const pktMs = date.getTime() + CLASS_TIMEZONE_OFFSET_HOURS * 60 * 60 * 1000;
      const local = new Date(pktMs);
      const dateStr = local.toISOString().slice(0, 10);
      return `${classInfo.subject} | ${classInfo.teacher} | ${dateStr}`;
    }
  }

  // Last resort: use filename (strip extension)
  return fileName.replace(/\.[^.]+$/, "");
}

export function buildYoutubeDescription(fileName: string, createdTime: string | null | undefined): string {
  const lines: string[] = [];

  const filenameDate = extractFilenameTimestamp(fileName);
  if (filenameDate) {
    const classInfo = resolveClassFromDate(filenameDate);
    if (classInfo) {
      lines.push(`Subject: ${classInfo.subject}`);
      lines.push(`Teacher: ${classInfo.teacher}`);
    }
    lines.push(`Recorded: ${filenameDate.toLocaleString("en-PK", { timeZone: "Asia/Karachi" })} PKT`);
  } else if (createdTime) {
    const classInfo = resolveClassFromTime(createdTime);
    if (classInfo) {
      lines.push(`Subject: ${classInfo.subject}`);
      lines.push(`Teacher: ${classInfo.teacher}`);
    }
    lines.push(`Recorded: ${new Date(createdTime).toUTCString()}`);
  }

  lines.push(`Source file: ${fileName}`);
  lines.push(`Uploaded automatically by the class recording pipeline.`);
  return lines.join("\n");
}
