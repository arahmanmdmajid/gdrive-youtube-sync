import { createHash } from "node:crypto";
import type { AliasEntry } from "./teacherTile";

// Pure helpers for the alias table: rows to entries, a stable hash, and validation of what the route
// receives. No database here, so they are easy to test.

export type AliasKind = "strong" | "allOf" | "weak";
export interface AliasRow {
  teacher: string;
  kind: AliasKind;
  word: string;
}

const WORD = /^\p{L}+$/u;

/** Groups table rows into one entry per teacher, words sorted so the result does not depend on row order. */
export function entriesFromRows(rows: AliasRow[]): AliasEntry[] {
  const byTeacher = new Map<string, Required<Omit<AliasEntry, "teacher">>>();
  for (const r of rows) {
    const e = byTeacher.get(r.teacher) ?? { strong: [], allOf: [], weak: [] };
    e[r.kind].push(r.word);
    byTeacher.set(r.teacher, e);
  }
  return [...byTeacher.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([teacher, e]) => ({ teacher, strong: [...e.strong].sort(), allOf: [...e.allOf].sort(), weak: [...e.weak].sort() }));
}

/** Rows for the table from entries. Every word is lower case and appears once per (teacher, kind). */
export function rowsFromEntries(entries: AliasEntry[]): AliasRow[] {
  const rows: AliasRow[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    for (const kind of ["strong", "allOf", "weak"] as const) {
      for (const w of e[kind] ?? []) {
        const word = w.toLowerCase();
        const key = `${e.teacher}|${kind}|${word}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({ teacher: e.teacher, kind, word });
      }
    }
  }
  return rows;
}

/** Short fingerprint of the table: the same aliases give the same hash, any change gives another. */
export function aliasHash(entries: AliasEntry[]): string {
  const canonical = rowsFromEntries(entries)
    .map((r) => `${r.teacher}|${r.kind}|${r.word}`)
    .sort()
    .join("\n");
  return createHash("sha1").update(canonical).digest("hex").slice(0, 12);
}

export type ParsedAliases = { ok: true; entries: AliasEntry[] } | { ok: false; error: string };

/**
 * Validates the body of PUT /teacher-aliases: { "aliases": [ { "teacher": "...", "strong": [...], "allOf": [...], "weak": [...] } ] }.
 * Words must be letters only (they are matched as whole words) and are lower-cased. A teacher needs at
 * least one word. Nothing is guessed: any problem rejects the whole table.
 */
export function parseAliasBody(body: unknown): ParsedAliases {
  const list = (body as { aliases?: unknown } | null)?.aliases;
  if (!Array.isArray(list)) return { ok: false, error: 'Expected { "aliases": [ ... ] }.' };
  const entries: AliasEntry[] = [];
  const teachers = new Set<string>();
  for (const [i, raw] of list.entries()) {
    const item = raw as Record<string, unknown> | null;
    const teacher = typeof item?.teacher === "string" ? item.teacher.trim() : "";
    if (!teacher) return { ok: false, error: `Entry ${i + 1} has no teacher name.` };
    if (teachers.has(teacher)) return { ok: false, error: `Teacher "${teacher}" appears twice.` };
    teachers.add(teacher);
    const entry: AliasEntry = { teacher, strong: [], allOf: [], weak: [] };
    for (const kind of ["strong", "allOf", "weak"] as const) {
      const words = item?.[kind];
      if (words === undefined) continue;
      if (!Array.isArray(words)) return { ok: false, error: `"${kind}" of "${teacher}" must be a list of words.` };
      for (const w of words) {
        const word = typeof w === "string" ? w.trim().toLowerCase() : "";
        if (!WORD.test(word)) return { ok: false, error: `"${String(w)}" for "${teacher}" is not a word of letters only.` };
        if (!entry[kind]!.includes(word)) entry[kind]!.push(word);
      }
    }
    if (entry.strong!.length + entry.allOf!.length + entry.weak!.length === 0) {
      return { ok: false, error: `Teacher "${teacher}" has no words.` };
    }
    entries.push(entry);
  }
  return { ok: true, entries };
}
