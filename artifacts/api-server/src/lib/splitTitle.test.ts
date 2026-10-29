import { test } from "node:test";
import assert from "node:assert/strict";
import { mergedTitles, slotTitleOf } from "./splitTitle";

test("a Part N suffix is removed", () => {
  assert.equal(
    slotTitleOf("1.1 Jalalain Part 1 | Ustad Fayyaz | 10-10-2026 | Part 2"),
    "1.1 Jalalain Part 1 | Ustad Fayyaz | 10-10-2026",
  );
});

test("a title without the suffix, and null, are unchanged", () => {
  const t = "1.1 Jalalain Part 1 | Ustad Fayyaz | 10-10-2026";
  assert.equal(slotTitleOf(t), t);
  assert.equal(slotTitleOf(null), null);
});

test("a merge numbers both recordings by time while the other is in review", () => {
  assert.deepEqual(mergedTitles("T", true, true), { current: "T | Part 2", other: "T | Part 1" });
  assert.deepEqual(mergedTitles("T", false, true), { current: "T | Part 1", other: "T | Part 2" });
});

test("a merge leaves a recording that left review untouched", () => {
  assert.equal(mergedTitles("T", true, false).other, null);
  assert.equal(mergedTitles("T", true, false).current, "T | Part 2");
});
