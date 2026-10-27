import { test } from "node:test";
import assert from "node:assert/strict";
import { slotTitleOf } from "./splitTitle";

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
