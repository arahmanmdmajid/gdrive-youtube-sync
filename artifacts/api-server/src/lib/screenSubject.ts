import type { OcrLine } from "./windowsOcr";

/** What a shared PDF says the class is about: the subject and the lecture serials it could be. */
export type ScreenSubject = { subject: string; serials: string[] };

// Word fragments of a book's file name, as they come out of the OCR. A name is reduced to its letters with
// the look-alikes i, 1 and | read as "l" (the OCR swaps them), so "FaozuIKabeer" still finds "kabeer".
// Arabic is reduced the same way: no vowel marks, one kind of alef.
const key = (s: string) =>
  s
    .toLowerCase()
    .replace(/[ً-ْٰ]/g, "")
    .replace(/[آأإ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[^a-z؀-ۿ]/g, "")
    .replace(/[i|]/g, "l");

// Only subjects whose file names have been seen on a real shared screen. Add Siraji, Tawzeeh, Sharah Aqaid,
// Falakiyat, Matan ul Kafi and Dewan Hamasa when theirs have.
const SUBJECTS: { subject: string; words: string[]; serials: string[] }[] = [
  { subject: "Jalalain", words: ["jalala"], serials: ["1.1", "1.2", "1.3"] },
  { subject: "Al Fawz ul Kabir", words: ["faoz", "fawz", "kabeer"], serials: ["2.1"] },
  { subject: "Kitab ul Asar", words: ["asar", "asaar", "athar", "الاثار"], serials: ["2.2"] },
  { subject: "Khair ul Usool", words: ["khairulusool", "usool"], serials: ["2.4"] },
  { subject: "Hidaya Sani", words: ["hidaya"], serials: ["3.1", "3.2", "3.3"] },
  { subject: "Ulama-e-Deoband", words: ["deoband", "oeoband"], serials: ["5.3"] },
].map((s) => ({ ...s, words: s.words.map(key) }));

/**
 * The subject named by the file name in the PDF viewer's toolbar, or null when it names none or more than
 * one. A Jalalain file name carries its volume as the library code (6.1.2, or 6-12 / 6.12 when the OCR
 * drops a dot), which is the lecture serial 1.2.
 */
export function subjectFromFileName(fileName: string): ScreenSubject | null {
  const k = key(fileName);
  const found = SUBJECTS.filter((s) => s.words.some((w) => k.includes(w)));
  if (found.length !== 1) return null;
  const { subject, serials } = found[0];
  if (subject !== "Jalalain") return { subject, serials };
  const volume = /(?:^|\D)6\s*[.\-_]?\s*1\s*[.\-_]?\s*([123])(?!\d)/.exec(fileName)?.[1];
  return { subject, serials: volume ? [`1.${volume}`] : serials };
}

/** True when the title's serial is one of the serials the screen allows. */
export function screenAgreesWith(title: string | null | undefined, screen: ScreenSubject): boolean {
  const serial = /^(\d+\.\d+) /.exec(title ?? "")?.[1];
  return !!serial && screen.serials.includes(serial);
}

/** Bump when SUBJECTS changes, so recordings are read again with the new table. */
export const SCREEN_TABLE_VERSION = 1;

export interface ScreenReading {
  subject: string | null;
  serials: string[];
  /** Frames where the toolbar showed a known subject. */
  framesMatched: number;
  /** The frames named different subjects (or volumes), so no subject is given. */
  ambiguous: boolean;
}

const COUNTER = /^\d{1,4}\s*\/\s*\d{1,4}$/;
const SAME_ROW_PX = 8;

/** The subject all the given readings agree on, or null when they differ. */
function agreed(found: ScreenSubject[]): ScreenSubject | null {
  const subject = found[0].subject;
  if (found.some((f) => f.subject !== subject)) return null;
  const serials = found[0].serials.filter((s) => found.every((f) => f.serials.includes(s)));
  return serials.length ? { subject, serials } : null;
}

/**
 * The subject named by the PDF viewer's toolbar in the recognized lines of a recording's frames. The
 * toolbar's file name is the line on the same row as the page counter ("620 / 681") and to its left; the
 * address bar and the browser tabs (the class representative keeps many open) are never looked at. Frames
 * with no such line are skipped; the frames that have one must agree.
 */
export function subjectFromFrames(frames: OcrLine[][]): ScreenReading {
  const perFrame: ScreenSubject[] = [];
  let ambiguous = false;
  for (const lines of frames) {
    const counters = lines.filter((l) => COUNTER.test(l.text.trim()));
    const found = lines
      .filter((l) => counters.some((c) => Math.abs(c.y - l.y) <= SAME_ROW_PX && l.x < c.x))
      .map((l) => subjectFromFileName(l.text))
      .filter((s): s is ScreenSubject => s !== null);
    if (found.length === 0) continue;
    const one = agreed(found);
    if (one) perFrame.push(one);
    else ambiguous = true;
  }
  const all = perFrame.length ? agreed(perFrame) : null;
  if (perFrame.length && !all) ambiguous = true;
  if (ambiguous || !all) return { subject: null, serials: [], framesMatched: perFrame.length, ambiguous };
  return { subject: all.subject, serials: all.serials, framesMatched: perFrame.length, ambiguous: false };
}

/** What the Jobs page shows for a read: the subject the screen showed and whether the title's serial is one it allows. Null when no subject was seen. */
export function screenSeenFor(read: { subject: string | null; serials: string[] }, title: string): { subject: string; agrees: boolean } | null {
  if (!read.subject) return null;
  return { subject: read.subject, agrees: screenAgreesWith(title, { subject: read.subject, serials: read.serials }) };
}
