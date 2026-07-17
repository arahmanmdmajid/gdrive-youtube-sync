// Subject grouping for the student platform. Lectures (done jobs) are grouped
// by the serial prefix already present in their titles, e.g.
// "1.2 Jalalain Part 2 | Ustad Haseeb | 18-05-2026".
// Older uploads have Arabic titles without a serial; those are matched by
// Arabic subject name (map mirrored from api-server/src/lib/schedule.ts).

export interface SubjectInfo {
  serial: string;
  nameEn: string;
  teacherEn: string;
}

export const SUBJECTS: SubjectInfo[] = [
  { serial: "1.1", nameEn: "Jalalain Part 1", teacherEn: "Ustad Fayyaz" },
  { serial: "1.2", nameEn: "Jalalain Part 2", teacherEn: "Ustad Haseeb" },
  { serial: "1.3", nameEn: "Jalalain Part 3", teacherEn: "Ustad Wasimullah" },
  { serial: "2.1", nameEn: "Al Fawz ul Kabir", teacherEn: "Ustad Haseeb" },
  { serial: "2.2", nameEn: "Kitab ul Asar", teacherEn: "Ustad Haseeb" },
  { serial: "2.3", nameEn: "Siraji", teacherEn: "Ustad Khalid Zaman" },
  { serial: "3.1", nameEn: "Hidaya Sani Part 1", teacherEn: "Ustad Sirajul Haq" },
  { serial: "3.2", nameEn: "Hidaya Sani Part 2", teacherEn: "Ustad Saeedur Rahman" },
  { serial: "3.3", nameEn: "Hidaya Sani Part 3", teacherEn: "Ustad Aslam Shah" },
  { serial: "4.1", nameEn: "Tawzeeh Part 1", teacherEn: "Ustad Atiqullah" },
  { serial: "4.2", nameEn: "Tawzeeh Part 2", teacherEn: "Ustad Saeedur Rahman" },
  { serial: "5.1", nameEn: "Sharah Aqaid", teacherEn: "Ustad Khalid Zaman" },
  { serial: "5.2", nameEn: "Falakiyat", teacherEn: "Ustad Khalid Zaman" },
  { serial: "6.1", nameEn: "Matan ul Kafi", teacherEn: "Ustad Aamir Iqbal" },
  { serial: "6.2", nameEn: "Dewan Hamasa", teacherEn: "Ustad Faraz" },
];

// Arabic subject name → serial, for pre-serial-format titles
const ARABIC_SUBJECT_SERIAL: Record<string, string> = {
  "جلالين اول": "1.1",
  "جلالين دوم": "1.2",
  "جلالين ثلث": "1.3",
  "الفوز الكبير": "2.1",
  "كتاب الآثار، خير الأصول": "2.2",
  "سراجى": "2.3",
  "هداية ثاني حصہ اول": "3.1",
  "هداية ثاني حصہ دوم": "3.2",
  "هداية ثاني حصہ سوم": "3.3",
  "توضيح اول": "4.1",
  "توضيح دوم": "4.2",
  "شرح عقائد": "5.1",
  "فلکیات": "5.2",
  "متن الكافي، الهيئة الصغرى": "6.1",
  "ديوان حماسہ": "6.2",
};

export const UNGROUPED_SERIAL = "other";

const SERIALS = new Set(SUBJECTS.map((s) => s.serial));

/**
 * Resolves the subject serial for a lecture title. Falls back to the Arabic
 * subject map for old titles; returns UNGROUPED_SERIAL when nothing matches.
 */
export function serialForTitle(title: string | null | undefined): string {
  if (!title) return UNGROUPED_SERIAL;

  const match = title.match(/^(\d+\.\d+)\s/);
  if (match && SERIALS.has(match[1]!)) return match[1]!;

  const arabicSubject = title.split("|")[0]?.trim();
  if (arabicSubject && ARABIC_SUBJECT_SERIAL[arabicSubject]) {
    return ARABIC_SUBJECT_SERIAL[arabicSubject]!;
  }

  return UNGROUPED_SERIAL;
}
