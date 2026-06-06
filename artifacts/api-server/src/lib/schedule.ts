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

// Classes run 6:00 PM – 10:00 PM in 30-min slots
// Timezone offset for the classes (PKT = UTC+5)
const CLASS_TIMEZONE_OFFSET = 5 * 60; // minutes

export function resolveClassFromTime(isoTimestamp: string): ClassSlot | null {
  const date = new Date(isoTimestamp);

  // Convert to local time (PKT UTC+5)
  const localMs = date.getTime() + CLASS_TIMEZONE_OFFSET * 60 * 1000;
  const local = new Date(localMs);

  const dayOfWeek = local.getUTCDay(); // 0=Sun, 1=Mon, 2=Tue, 5=Fri, 6=Sat
  const hours = local.getUTCHours();
  const minutes = local.getUTCMinutes();

  // Round down to nearest 30-min slot
  const slotMinutes = minutes < 30 ? 0 : 30;
  const slotKey = `${String(hours).padStart(2, "0")}:${String(slotMinutes).padStart(2, "0")}`;

  const daySchedule = SCHEDULE[String(dayOfWeek)];
  if (!daySchedule) return null;

  return daySchedule[slotKey] ?? null;
}

export function buildYoutubeTitle(fileName: string, createdTime: string | null | undefined): string {
  if (createdTime) {
    const classInfo = resolveClassFromTime(createdTime);
    if (classInfo) {
      const date = new Date(createdTime);
      const localMs = date.getTime() + CLASS_TIMEZONE_OFFSET * 60 * 1000;
      const local = new Date(localMs);
      const dateStr = local.toISOString().slice(0, 10); // YYYY-MM-DD
      return `${classInfo.subject} | ${classInfo.teacher} | ${dateStr}`;
    }
  }
  // Fall back to Drive file name (strip extension)
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
    const date = new Date(createdTime);
    lines.push(`Recorded: ${date.toUTCString()}`);
  }
  lines.push(`Source file: ${fileName}`);
  lines.push(`Uploaded automatically by the class recording pipeline.`);
  return lines.join("\n");
}
