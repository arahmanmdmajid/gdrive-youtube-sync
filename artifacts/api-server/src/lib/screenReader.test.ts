import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { readRecordingScreen, type ScreenReaderDeps } from "./screenReader";
import { subjectFromFrames } from "./screenSubject";
import { runScreenStep } from "./screenStep";
import { parseOcrLines, type OcrLine } from "./windowsOcr";

const line = (text: string, x: number, y: number): OcrLine => ({ text, x, y, w: 100, h: 12 });
const SECRET = "ZZ-PERSONAL-TAB-ZZ";

// A frame as measured on real recordings: the toolbar file name at the viewer's left edge, the page counter
// on the same row to its right, the address bar above, and other text around.
const frame = (toolbar: string, counter = "198 / 681") => [
  line(`${SECRET} Gmail`, 40, 20),
  line("20vol.pdf%204th%20Sani%20Hidayah%6.3.3/Books", 82, 187),
  line(toolbar, 60, 322),
  line(counter, 516, 322),
  line("10/30", 1700, 1050),
];

test("the toolbar line on the counter's row gives the subject; the address bar and tabs are not read", () => {
  const r = subjectFromFrames([frame("6-1.1 TafseerUl Jalalain voll AIBushracolor 040726_pdf"), frame("6-1.1 TafseerUl Jalalain Vol1 AlBushraColor 040726_ pdf", "199 / 681")]);
  assert.deepEqual([r.subject, r.serials, r.framesMatched, r.ambiguous], ["Jalalain", ["1.1"], 2, false]);
  // the address bar names Hidaya but sits on another row, so it is not used
  const onlyAddress = subjectFromFrames([[line("20vol.pdf%204th%20Sani%20Hidayah%6.3.3", 82, 187), line("198 / 681", 516, 322)]]);
  assert.deepEqual([onlyAddress.subject, onlyAddress.framesMatched, onlyAddress.ambiguous], [null, 0, false]);
});

test("a tab or the clock that looks like a counter does not make a toolbar", () => {
  const r = subjectFromFrames([[line("Tafseer Jalalain Vol2 - Chrome", 300, 5), line("10/30", 1700, 1050)]]);
  assert.equal(r.subject, null);
});

test("frames without a toolbar are skipped; the others decide; a volume seen in one frame narrows the rest", () => {
  const r = subjectFromFrames([[line("no pdf here", 10, 10)], frame("TafseerUl Jalalain AlBushra"), frame("6.1.2 TafseerUl Jalalain Vol2")]);
  assert.deepEqual([r.subject, r.serials, r.framesMatched], ["Jalalain", ["1.2"], 2]);
});

test("frames that name different books are ambiguous, not a guess", () => {
  const r = subjectFromFrames([frame("6.1.2 TafseerUl Jalalain Vol2"), frame("Ulama-e-Deoband ka Deeni Rukh")]);
  assert.deepEqual([r.subject, r.serials, r.ambiguous], [null, [], true]);
  const volumes = subjectFromFrames([frame("6.1.1 TafseerUl Jalalain Vol1"), frame("6.1.2 TafseerUl Jalalain Vol2")]);
  assert.deepEqual([volumes.subject, volumes.ambiguous], [null, true]);
});

test("the Arabic toolbar title of Kitab ul Asar reads", () => {
  const r = subjectFromFrames([frame("الشيباني الحسن بن لمحمد الآثار كتاب", "455 / 860")]);
  assert.deepEqual([r.subject, r.serials], ["Kitab ul Asar", ["2.2"]]);
});

// ── The reader ─────────────────────────────────────────────────────────────

function deps(over: Partial<ScreenReaderDeps> & { frames?: OcrLine[][]; framesMade?: number } = {}): ScreenReaderDeps & { dirs: string[] } {
  const dirs: string[] = [];
  return {
    dirs,
    makeTempDir: async () => {
      const d = await fs.mkdtemp(path.join(os.tmpdir(), "dtt-test-screen-"));
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
    ocr: async (paths) => (over.frames ?? paths.map(() => [])).slice(0, paths.length),
    ...over,
  } as ScreenReaderDeps & { dirs: string[] };
}

const job = { driveFileId: "file-1", durationSeconds: 1500 };

test("reads the subject, returns only the verdict, and removes the temporary folder", async () => {
  const d = deps({ frames: [frame("6.1.2 TafseerUl Jalalain Vol2"), [], frame("6.1.2 TafseerUl Jalalain Vol2"), []] });
  const r = await readRecordingScreen(job, d);
  assert.deepEqual([r.status, r.subject, r.serials, r.framesRead, r.framesMatched, r.error], ["ok", "Jalalain", ["1.2"], 4, 2, null]);
  assert.ok(!JSON.stringify(r).includes(SECRET), "the recognized text is not in the result");
  assert.equal(existsSync(d.dirs[0]), false, "the temporary folder is gone");
});

test("no book seen is an ok read with no subject", async () => {
  const r = await readRecordingScreen(job, deps());
  assert.deepEqual([r.status, r.subject, r.ambiguous], ["ok", null, false]);
});

test("no frame, an OCR failure, a failing extractor and no length are failed reads; the folder is still removed", async () => {
  const none = deps({ framesMade: 0 });
  assert.match((await readRecordingScreen(job, none)).error!, /no frame/);
  assert.equal(existsSync(none.dirs[0]), false);

  const ocr = deps({ ocr: async () => { throw new Error("Windows has no OCR language installed"); } });
  const r = await readRecordingScreen(job, ocr);
  assert.equal(r.status, "failed");
  assert.match(r.error!, /OCR language/);
  assert.equal(existsSync(ocr.dirs[0]), false);

  const long = deps({ extract: async () => { throw new Error("x".repeat(500)); } });
  assert.ok((await readRecordingScreen(job, long)).error!.length <= 150);
  assert.equal(existsSync(long.dirs[0]), false);

  const d = deps();
  assert.match((await readRecordingScreen({ driveFileId: "f", durationSeconds: null }, d)).error!, /length/);
  assert.equal(d.dirs.length, 0, "nothing was created");
});

// ── OCR lines and the step ─────────────────────────────────────────────────

test("OCR output lines: positions per file, a missing file or a row without lines gives none", () => {
  const out = '﻿{"file":"frame1.jpg","text":"a b","lines":[{"t":"a b","x":60,"y":322,"w":315,"h":13}]}\r\nnot json\r\n{"file":"frame3.jpg","text":""}\n';
  assert.deepEqual(parseOcrLines(out, ["frame1.jpg", "frame2.jpg", "frame3.jpg"]), [[{ text: "a b", x: 60, y: 322, w: 315, h: 13 }], [], []]);
});

test("the step does nothing unless SCREEN_CHECK is on, and never throws", async () => {
  let calls = 0;
  const reads = async () => {
    calls++;
    return { skipped: null, attempted: 1, results: [] };
  };
  assert.deepEqual(await runScreenStep({ enabled: false, reads }), { ran: false, attempted: 0 });
  assert.equal(calls, 0);
  assert.deepEqual(await runScreenStep({ enabled: true, reads }), { ran: true, attempted: 1 });
  assert.deepEqual(await runScreenStep({ enabled: true, reads: async () => { throw new Error("db down"); } }), { ran: true, attempted: 0 });
});
