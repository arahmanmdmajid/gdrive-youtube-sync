// Mirrors artifacts/api-server/src/lib/libraryCategories.ts — duplicated per
// the existing cross-service convention (see subjects.ts's note on
// ARABIC_SUBJECT_SERIAL mirroring schedule.ts).
export const CATEGORY_LABELS: Record<string, string> = {
  "6.1": "Tafseer",
  "6.2": "Usul al-Tafseer, Hadith & Fara'idh",
  "6.3": "Fiqh",
  "6.4": "Usul al-Fiqh",
  "6.5": "Aqaid & Falakiyat",
  "6.6": "Arabic Language & Prosody",
  misc: "Miscellaneous & Past Papers",
};

export const CATEGORY_ORDER = ["6.1", "6.2", "6.3", "6.4", "6.5", "6.6", "misc"];
