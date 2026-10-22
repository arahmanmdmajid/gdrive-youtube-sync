import { test } from "node:test";
import assert from "node:assert/strict";
import { readTeacher, matchesEntry, wordsOf, type AliasEntry } from "./teacherTile";

// Invented teachers, so no real alias is in the repository.
const ALPHA: AliasEntry = { teacher: "Ustad Alpha", strong: ["alphonse"], weak: ["khan", "ahmed"] };
const BETA: AliasEntry = { teacher: "Ustad Beta", allOf: ["b", "sh"] }; // a short alias such as "B Sh"
const GAMMA: AliasEntry = { teacher: "Ustad Gamma", strong: ["gammaro"], weak: ["khan", "syed"] };
const ALIASES = [ALPHA, BETA, GAMMA];

test("wordsOf: whole words, lower case, punctuation ignored", () => {
  assert.deepEqual([...wordsOf("Ustad ALPHONSE-Khan, (B.Sh)")].sort(), ["alphonse", "b", "khan", "sh", "ustad"]);
  assert.deepEqual([...wordsOf("")], []);
});

test("a strong word identifies the teacher, whatever the case", () => {
  const r = readTeacher(["ALPHONSE KHAN"], ALIASES);
  assert.equal(r.teacher, "Ustad Alpha");
  assert.equal(r.ambiguous, false);
  assert.deepEqual(r.matched, ["Ustad Alpha"]);
});

test("an all-of alias needs every word: one letter alone proves nothing", () => {
  assert.equal(readTeacher(["B"], ALIASES).teacher, null);
  assert.equal(readTeacher(["sh"], ALIASES).teacher, null);
  assert.equal(readTeacher(["B Sh"], ALIASES).teacher, "Ustad Beta");
  assert.equal(readTeacher(["bash"], ALIASES).teacher, null, "whole words only");
});

test("weak words count only in pairs, and a shared common name does not identify anyone alone", () => {
  assert.equal(readTeacher(["khan"], ALIASES).teacher, null, "one weak word is not enough");
  assert.equal(readTeacher(["ahmed"], ALIASES).teacher, null);
  assert.equal(readTeacher(["khan ahmed"], ALIASES).teacher, "Ustad Alpha", "two different weak words of Alpha");
  assert.equal(readTeacher(["khan khan khan"], ALIASES).teacher, null, "the same weak word repeated is still one");
  // khan is a weak word of two teachers: with syed only Gamma has two
  assert.equal(readTeacher(["khan syed"], ALIASES).teacher, "Ustad Gamma");
});

test("two teachers matching is ambiguous, never a guess", () => {
  const r = readTeacher(["alphonse and gammaro"], ALIASES);
  assert.equal(r.teacher, null);
  assert.equal(r.ambiguous, true);
  assert.deepEqual(r.matched.sort(), ["Ustad Alpha", "Ustad Gamma"]);
});

test("no match gives no teacher and is not ambiguous", () => {
  const r = readTeacher(["some student name", ""], ALIASES);
  assert.equal(r.teacher, null);
  assert.equal(r.ambiguous, false);
  assert.deepEqual(r.matched, []);
  assert.equal(r.frames, 2);
});

test("frames are combined, and the number of frames that matched is reported", () => {
  const r = readTeacher(["", "Ustad Alphonse", "nothing", "alphonse"], ALIASES);
  assert.equal(r.teacher, "Ustad Alpha");
  assert.equal(r.frames, 4);
  assert.equal(r.framesMatched, 2);
  // an all-of alias can be completed from different frames
  assert.equal(readTeacher(["B", "Sh"], ALIASES).teacher, "Ustad Beta");
});

test("an entry with no words never matches", () => {
  assert.equal(matchesEntry(wordsOf("anything at all"), { teacher: "Nobody" }), false);
  assert.equal(readTeacher(["anything"], [{ teacher: "Nobody", strong: [], allOf: [], weak: [] }]).teacher, null);
});

test("no frames and no aliases", () => {
  assert.deepEqual(readTeacher([], ALIASES), { teacher: null, ambiguous: false, matched: [], framesMatched: 0, frames: 0 });
  assert.equal(readTeacher(["alphonse"], []).teacher, null);
});
