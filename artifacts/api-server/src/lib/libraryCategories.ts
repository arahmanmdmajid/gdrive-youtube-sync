// Books/library category codes shown to students are English-only, mirroring
// schedule.ts's SUBJECT_SERIAL approach: store a short code per row, derive
// the display label in code so relabeling isn't a data migration.
export const CATEGORY_LABELS: Record<string, string> = {
  "6.1": "Tafseer",
  "6.2": "Usul al-Tafseer, Hadith & Fara'idh",
  "6.3": "Fiqh",
  "6.4": "Usul al-Fiqh",
  "6.5": "Aqaid & Falakiyat",
  "6.6": "Arabic Language & Prosody",
  misc: "Miscellaneous & Past Papers",
};

// Arabic Drive subfolder name -> category code, used when scanning the
// library folder to map each subfolder's files to a category.
export const FOLDER_NAME_TO_CATEGORY: Record<string, string> = {
  "6.1 التفسير": "6.1",
  "6.2 الاصول التفسير و الحديث و الفرائض": "6.2",
  "6.3 الفقه": "6.3",
  "6.4 الاصول الفقه": "6.4",
  "6.5 العقائد و الفلكيات": "6.5",
  "6.6 اللغة العربية و العروض": "6.6",
  "متفرق": "misc",
};

export const CATEGORY_ORDER = ["6.1", "6.2", "6.3", "6.4", "6.5", "6.6", "misc"];
