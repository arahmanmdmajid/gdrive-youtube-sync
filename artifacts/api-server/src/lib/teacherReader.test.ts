import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { readRecordingTeacher, sweepTileFolders, TILE_DIR_PREFIX, type ReaderDeps } from "./teacherReader";
import { parseOcrOutput } from "./windowsOcr";
import { entriesFromRows, rowsFromEntries, aliasHash, parseAliasBody } from "./teacherAliasTable";
import type { AliasEntry } from "./teacherTile";

// Invented teachers and an invented student, so nothing real is in the repository.
const ALIASES: AliasEntry[] = [
  { teacher: "Ustad Alpha", strong: ["alphonse"], weak: ["khan", "ahmed"] },
  { teacher: "Ustad Beta", allOf: ["b", "sh"] },
];
const STUDENT_TEXT = "ZZ-STUDENT-NAME-ZZ";

/** Frames are real (empty) files in a real temporary folder, so removal can be checked. */
function deps(over: Partial<ReaderDeps> & { texts?: string[]; framesFailed?: number; framesMade?: number } = {}): ReaderDeps & { dirs: string[] } {
  const dirs: string[] = [];
  return {
    dirs,
    aliases: ALIASES,
    makeTempDir: async () => {
      const d = await fs.mkdtemp(path.join(os.tmpdir(), "dtt-test-tile-"));
      dirs.push(d);
      return d;
    },
    extract: async (_id, _dur, dir) => {
      const n = over.framesMade ?? 4;
      const paths: string[] = [];
      for (let k = 1; k <= n; k++) {
        const p = path.join(dir, `frame${k}.jpg`);
        await fs.writeFile(p, "not really a jpeg");
        paths.push(p);
      }
      return { paths, failed: 4 - n };
    },
    ocr: async (paths) => (over.texts ?? paths.map(() => "")).slice(0, paths.length),
    ...over,
  } as ReaderDeps & { dirs: string[] };
}

const job = { driveFileId: "file-1", durationSeconds: 1500 };

test("reads the teacher from the frames, returns only the verdict, and removes the temporary folder", async () => {
  const d = deps({ texts: [STUDENT_TEXT, "Ustad ALPHONSE", "", `${STUDENT_TEXT} alphonse`] });
  const r = await readRecordingTeacher(job, d);
  assert.equal(r.status, "ok");
  assert.equal(r.teacher, "Ustad Alpha");
  assert.equal(r.framesRead, 4);
  assert.equal(r.framesMatched, 2);
  assert.equal(r.framesTotal, 4);
  assert.equal(r.error, null);
  assert.ok(!JSON.stringify(r).includes(STUDENT_TEXT), "the recognized text is not in the result");
  assert.equal(d.dirs.length, 1);
  assert.equal(existsSync(d.dirs[0]), false, "the temporary folder is gone");
});

test("nobody identified is an ok read with no teacher; two teachers is ambiguous", async () => {
  const none = await readRecordingTeacher(job, deps({ texts: [STUDENT_TEXT, "", "", ""] }));
  assert.deepEqual([none.status, none.teacher, none.ambiguous], ["ok", null, false]);
  const both = await readRecordingTeacher(job, deps({ texts: ["alphonse", "B Sh", "", ""] }));
  assert.deepEqual([both.status, both.teacher, both.ambiguous], ["ok", null, true]);
  assert.deepEqual(both.matched.sort(), ["Ustad Alpha", "Ustad Beta"]);
});

test("a recording where some frames fail is read from the rest", async () => {
  const r = await readRecordingTeacher(job, deps({ framesMade: 2, texts: ["alphonse", ""] }));
  assert.equal(r.status, "ok");
  assert.equal(r.framesRead, 2);
  assert.equal(r.framesTotal, 4);
  assert.equal(r.teacher, "Ustad Alpha");
});

test("no frame at all is a failed read, and the folder is still removed", async () => {
  const d = deps({ framesMade: 0 });
  const r = await readRecordingTeacher(job, d);
  assert.equal(r.status, "failed");
  assert.equal(r.teacher, null);
  assert.match(r.error!, /no frame/);
  assert.equal(existsSync(d.dirs[0]), false);
});

test("an OCR failure is a failed read with a short message, and the folder is removed", async () => {
  const d = deps({
    ocr: async () => {
      throw new Error("Windows has no OCR language installed");
    },
  });
  const r = await readRecordingTeacher(job, d);
  assert.equal(r.status, "failed");
  assert.match(r.error!, /OCR language/);
  assert.equal(existsSync(d.dirs[0]), false);
});

test("a failing extractor is a failed read, an error message is cut short, and the folder is removed", async () => {
  const d = deps({
    extract: async () => {
      throw new Error("x".repeat(500));
    },
  });
  const r = await readRecordingTeacher(job, d);
  assert.equal(r.status, "failed");
  assert.ok(r.error!.length <= 150);
  assert.equal(existsSync(d.dirs[0]), false);
});

test("no length yet, or an empty alias table, fails without touching Drive or making a folder", async () => {
  const d = deps();
  const noLength = await readRecordingTeacher({ driveFileId: "f", durationSeconds: null }, d);
  assert.equal(noLength.status, "failed");
  assert.match(noLength.error!, /length/);
  const noAliases = await readRecordingTeacher(job, { ...d, aliases: [] });
  assert.equal(noAliases.status, "failed");
  assert.match(noAliases.error!, /alias/);
  assert.equal(d.dirs.length, 0, "nothing was created");
});

// ── OCR output ─────────────────────────────────────────────────────────────

test("OCR output: one JSON line per file, matched by name, a missing file gives an empty text", () => {
  const out = '﻿{"file":"frame1.jpg","text":"hello"}\r\nnot json\r\n{"file":"frame3.jpg","text":""}\n{"file":"other.jpg","text":"x"}\n';
  assert.deepEqual(parseOcrOutput(out, ["frame1.jpg", "frame2.jpg", "frame3.jpg"]), ["hello", "", ""]);
  assert.deepEqual(parseOcrOutput("", ["a.jpg"]), [""]);
});

// ── The alias table ────────────────────────────────────────────────────────

test("alias rows and entries round-trip, whatever the row order, and the hash follows the content", () => {
  const rows = rowsFromEntries(ALIASES);
  assert.equal(rows.length, 5);
  assert.deepEqual(entriesFromRows(rows), entriesFromRows([...rows].reverse()));
  const e = entriesFromRows(rows).find((x) => x.teacher === "Ustad Alpha")!;
  assert.deepEqual(e, { teacher: "Ustad Alpha", strong: ["alphonse"], allOf: [], weak: ["ahmed", "khan"] });

  const same = aliasHash(ALIASES);
  assert.equal(aliasHash([...ALIASES].reverse()), same, "order does not matter");
  assert.equal(aliasHash(ALIASES.map((a) => ({ ...a, weak: [...(a.weak ?? [])].reverse() }))), same);
  assert.notEqual(aliasHash([...ALIASES, { teacher: "Ustad Gamma", strong: ["gammaro"] }]), same);
  assert.notEqual(aliasHash([{ ...ALIASES[0], strong: ["alphonsus"] }, ALIASES[1]]), same);
  assert.equal(same.length, 12);
});

test("the alias body is validated and normalized, and one problem rejects the table", () => {
  const ok = parseAliasBody({ aliases: [{ teacher: " Ustad Alpha ", strong: ["Alphonse", "alphonse"], weak: ["KHAN"] }, { teacher: "Ustad Beta", allOf: ["B", "Sh"] }] });
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.deepEqual(ok.entries[0], { teacher: "Ustad Alpha", strong: ["alphonse"], allOf: [], weak: ["khan"] });
    assert.deepEqual(ok.entries[1].allOf, ["b", "sh"]);
  }
  const bad = (body: unknown) => {
    const r = parseAliasBody(body);
    assert.equal(r.ok, false);
    return r.ok ? "" : r.error;
  };
  assert.match(bad({}), /aliases/);
  assert.match(bad({ aliases: [{ strong: ["x"] }] }), /no teacher/);
  assert.match(bad({ aliases: [{ teacher: "A" }] }), /no words/);
  assert.match(bad({ aliases: [{ teacher: "A", strong: ["x"] }, { teacher: "A", strong: ["y"] }] }), /twice/);
  assert.match(bad({ aliases: [{ teacher: "A", strong: ["two words"] }] }), /letters only/);
  assert.match(bad({ aliases: [{ teacher: "A", strong: ["a1"] }] }), /letters only/);
  assert.match(bad({ aliases: [{ teacher: "A", strong: "alpha" }] }), /list of words/);
});

// ── Frames left behind by a read that was cut short ────────────────────────

test("a sweep removes old frame folders, keeps a recent one (a read in progress) and touches nothing else", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "dtt-sweep-test-"));
  try {
    const mk = async (name: string, ageMs: number) => {
      const d = path.join(base, name);
      await fs.mkdir(d);
      await fs.writeFile(path.join(d, "frame1.jpg"), "not really a jpeg");
      const t = new Date(Date.now() - ageMs);
      await fs.utimes(d, t, t);
      return d;
    };
    const old1 = await mk(`${TILE_DIR_PREFIX}old1`, 60 * 60 * 1000);
    const old2 = await mk(`${TILE_DIR_PREFIX}old2`, 30 * 60 * 1000);
    const recent = await mk(`${TILE_DIR_PREFIX}recent`, 60 * 1000);
    const other = await mk("something-else", 24 * 60 * 60 * 1000);
    await fs.writeFile(path.join(base, `${TILE_DIR_PREFIX}file-not-folder`), "x");

    assert.equal(await sweepTileFolders({ baseDir: base }), 2);
    assert.equal(existsSync(old1), false);
    assert.equal(existsSync(old2), false);
    assert.equal(existsSync(recent), true, "a recent folder may belong to a read in progress");
    assert.equal(existsSync(other), true, "a folder without the reader's prefix is never touched");
    assert.equal(existsSync(path.join(base, `${TILE_DIR_PREFIX}file-not-folder`)), true);
    assert.equal(await sweepTileFolders({ baseDir: base }), 0, "nothing left to remove");
    assert.equal(await sweepTileFolders({ baseDir: base, olderThanMs: 0 }), 1, "with no age limit the recent one goes too");
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
});
