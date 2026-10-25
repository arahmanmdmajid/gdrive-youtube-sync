import { test } from "node:test";
import assert from "node:assert/strict";
import { canSwapWith, SWAP_REFUSED_MESSAGE } from "./swapRule";

test("a swap is allowed only with a recording still in review", () => {
  assert.equal(canSwapWith("needs_review"), true);
});

test("a swap is refused with a recording that has left review, uploaded or not", () => {
  for (const status of ["pending", "processing", "done", "failed", "removed", "rejected"]) {
    assert.equal(canSwapWith(status), false, status);
  }
});

test("the refusal says why and what to do instead", () => {
  assert.match(SWAP_REFUSED_MESSAGE, /already left review/);
  assert.match(SWAP_REFUSED_MESSAGE, /keep both/);
});
