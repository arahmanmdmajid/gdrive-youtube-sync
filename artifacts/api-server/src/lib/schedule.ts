export interface ClassSlot {
  subject: string;
  teacher: string;
}

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

/**
 * Resolves a class slot from a Drive ISO createdTime string.
 * Converts UTC → PKT, then looks up day-of-week + 30-min slot in the schedule.
 * Rounds the minutes to the nearest :00 or :30 boundary.
 */
export function resolveClassFromTime(isoTimestamp: string): ClassSlot | null {
  const utc = new Date(isoTimestamp);
  // Shift to PKT by adding offset as ms so we can use UTC getters
  const pktMs = utc.getTime() + PKT_OFFSET_HOURS * 60 * 60 * 1000;
  const pkt = new Date(pktMs);

  const dayOfWeek = pkt.getUTCDay(); // 0=Sun,1=Mon,2=Tue,5=Fri,6=Sat
  const hours = pkt.getUTCHours();
  const minutes = pkt.getUTCMinutes();

  // Round to nearest 30-min slot
  const slotMinutes = minutes < 30 ? 0 : 30;
  const slotKey = `${String(hours).padStart(2, "0")}:${String(slotMinutes).padStart(2, "0")}`;

  const daySchedule = SCHEDULE[String(dayOfWeek)];
  if (!daySchedule) return null;

  return daySchedule[slotKey] ?? null;
}

/**
 * Returns a PKT date string (YYYY-MM-DD) from a Drive ISO createdTime.
 */
function toPktDateStr(isoTimestamp: string): string {
  const utc = new Date(isoTimestamp);
  const pktMs = utc.getTime() + PKT_OFFSET_HOURS * 60 * 60 * 1000;
  return new Date(pktMs).toISOString().slice(0, 10);
}

export function buildYoutubeTitle(fileName: string, createdTime: string | null | undefined): string {
  if (createdTime) {
    const classInfo = resolveClassFromTime(createdTime);
    if (classInfo) {
      const dateStr = toPktDateStr(createdTime);
      return `${classInfo.subject} | ${classInfo.teacher} | ${dateStr}`;
    }
  }
  return fileName.replace(/\.[^.]+$/, "");
}

export function buildYoutubeDescription(fileName: string, createdTime: string | null | undefined): string {
  const lines: string[] = [];
  if (createdTime) {
    const classInfo = resolveClassFromTime(createdTime);
    if (classInfo) {
      lines.push(`Subject: ${classInfo.subject}`);
      lines.push(`Teacher: ${classInfo.teacher}`);
    }
    const dateStr = toPktDateStr(createdTime);
    lines.push(`Date (PKT): ${dateStr}`);
  }
  lines.push(`Source file: ${fileName}`);
  lines.push(`Uploaded automatically by the class recording pipeline.`);
  return lines.join("\n");
}
