// Plans how the old flat "Meet Recordings" archive is filed into "<code> - YYYY/MM/DD" day
// folders. Pure: no Drive or database access, so the rules can be checked on their own.

export interface ArchiveFile { id: string; name: string; mimeType: string }
export interface Leftover { name: string; reason: string }
export interface ArchivePlan { groups: Map<string, ArchiveFile[]>; leftovers: Leftover[] }

// Recordings and transcripts: "<code> (YYYY-MM-DD HH:mm GMT+5)". GMT+5 is PKT, so the date is
// already the PKT day the daily merge uses.
const RECORDING_RE = /^([a-z]{3}-[a-z]{4}-[a-z]{3}) \((\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2}) GMT\+5\)/;
// Gemini notes carry a date and time but no meeting code.
const NOTE_RE = /^Meeting started (\d{4})\/(\d{2})\/(\d{2}) (\d{2}:\d{2}) PKT - Notes by Gemini/;

export function dayFolderName(code: string, y: string, m: string, d: string): string {
  return `${code} - ${y}/${m}/${d}`;
}

export function planArchive(files: ArchiveFile[]): ArchivePlan {
  const groups = new Map<string, ArchiveFile[]>();
  const leftovers: Leftover[] = [];
  const codesAt = new Map<string, Set<string>>(); // "YYYY-MM-DD HH:mm" -> codes that recorded then
  const add = (key: string, f: ArchiveFile) => groups.set(key, [...(groups.get(key) ?? []), f]);

  const notes: { f: ArchiveFile; y: string; m: string; d: string; hm: string }[] = [];
  for (const f of files) {
    const r = f.name.match(RECORDING_RE);
    if (r) {
      add(dayFolderName(r[1]!, r[2]!, r[3]!, r[4]!), f);
      const at = `${r[2]}-${r[3]}-${r[4]} ${r[5]}`;
      codesAt.set(at, (codesAt.get(at) ?? new Set()).add(r[1]!));
      continue;
    }
    const n = f.name.match(NOTE_RE);
    if (n) notes.push({ f, y: n[1]!, m: n[2]!, d: n[3]!, hm: n[4]! });
    else leftovers.push({ name: f.name, reason: "name does not follow the Meet pattern" });
  }

  // A note goes to the recording that started in the same minute; zero or several candidates
  // means it is left where it is rather than guessed.
  for (const { f, y, m, d, hm } of notes) {
    const codes = codesAt.get(`${y}-${m}-${d} ${hm}`);
    if (codes?.size === 1) add(dayFolderName([...codes][0]!, y, m, d), f);
    else leftovers.push({ name: f.name, reason: codes ? "several recordings started at that minute" : "no recording started at that minute" });
  }
  return { groups, leftovers };
}
