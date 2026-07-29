const PKT_OFFSET_MINUTES = 5 * 60; // Pakistan Standard Time, UTC+5, no DST

/**
 * Midnight UTC of the current week's Sunday. Anchoring to "this week" (rather
 * than a fixed past date) matters because DST rules vary by season — e.g. US
 * Eastern is UTC-5 in January but UTC-4 in July. Using the real current week
 * ensures the target timezone's DST state matches what's actually in effect
 * right now, consistent with getUtcOffsetLabel's own `new Date()` anchor.
 */
function currentWeekSundayUtcMs(): number {
  const now = new Date();
  const todayUtcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const todayDow = new Date(todayUtcMidnight).getUTCDay();
  return todayUtcMidnight - todayDow * 24 * 60 * 60 * 1000;
}

const WEEKDAY_TO_NUMBER: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

const FALLBACK_TIMEZONES = [
  "Asia/Karachi", "UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "Europe/London", "Europe/Paris", "Europe/Istanbul", "Asia/Dubai", "Asia/Riyadh", "Asia/Kolkata",
  "Asia/Dhaka", "Asia/Jakarta", "Asia/Kuala_Lumpur", "Asia/Singapore", "Asia/Tokyo", "Asia/Shanghai",
  "Australia/Sydney", "Africa/Cairo", "Africa/Johannesburg",
];

export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Karachi";
  } catch {
    return "Asia/Karachi";
  }
}

export function getAllTimezones(): string[] {
  try {
    const supportedValuesOf = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    if (typeof supportedValuesOf === "function") {
      return supportedValuesOf("timeZone");
    }
  } catch {
    // fall through to fallback list below
  }
  return FALLBACK_TIMEZONES;
}

export interface ConvertedSlot {
  dayOfWeek: number;
  timeSlot: string; // "HH:MM"
}

/** Converts a PKT (day-of-week, "HH:MM") pair into the equivalent wall-clock moment in another IANA timezone. */
export function convertPktSlot(dayOfWeek: number, timeSlot: string, targetTz: string): ConvertedSlot {
  const [hours, minutes] = timeSlot.split(":").map(Number);
  const dayMs = currentWeekSundayUtcMs() + dayOfWeek * 24 * 60 * 60 * 1000;
  // PKT -> UTC: subtract the fixed 5h offset (Date.UTC/Date math normalizes any overflow/underflow across day boundaries)
  const utcMs = dayMs + (hours * 60 + minutes - PKT_OFFSET_MINUTES) * 60 * 1000;
  const instant = new Date(utcMs);

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: targetTz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instant);

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  let hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  if (hour === "24") hour = "00"; // some locales render midnight as "24" with hour12:false

  return {
    dayOfWeek: WEEKDAY_TO_NUMBER[weekday] ?? dayOfWeek,
    timeSlot: `${hour.padStart(2, "0")}:${minute}`,
  };
}

/** Current UTC offset label for a timezone, e.g. "GMT+5". */
export function getUtcOffsetLabel(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}
