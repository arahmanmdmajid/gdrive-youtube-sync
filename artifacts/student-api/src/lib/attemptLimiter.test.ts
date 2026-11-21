import { test } from "node:test";
import assert from "node:assert/strict";
import { createAttemptLimiter } from "./attemptLimiter";

const MIN = 60 * 1000;

test("allows attempts until the limit, then blocks", () => {
  const now = 0;
  const l = createAttemptLimiter({ max: 3, windowMs: 15 * MIN, now: () => now });
  for (let i = 0; i < 3; i++) {
    assert.equal(l.blocked("a"), false);
    l.fail("a");
  }
  assert.equal(l.blocked("a"), true);
});

test("each key has its own count", () => {
  const l = createAttemptLimiter({ max: 1, windowMs: MIN, now: () => 0 });
  l.fail("a");
  assert.equal(l.blocked("a"), true);
  assert.equal(l.blocked("b"), false);
});

test("failures older than the window stop counting", () => {
  let now = 0;
  const l = createAttemptLimiter({ max: 2, windowMs: 10 * MIN, now: () => now });
  l.fail("a");
  l.fail("a");
  assert.equal(l.blocked("a"), true);
  now = 10 * MIN + 1;
  assert.equal(l.blocked("a"), false);
});

test("only the failures inside the window count", () => {
  let now = 0;
  const l = createAttemptLimiter({ max: 2, windowMs: 10 * MIN, now: () => now });
  l.fail("a"); // t=0
  now = 6 * MIN;
  l.fail("a"); // t=6
  now = 11 * MIN; // the first has aged out, one is left
  assert.equal(l.blocked("a"), false);
  l.fail("a");
  assert.equal(l.blocked("a"), true);
});

test("a success clears the key", () => {
  const l = createAttemptLimiter({ max: 1, windowMs: MIN, now: () => 0 });
  l.fail("a");
  l.clear("a");
  assert.equal(l.blocked("a"), false);
});
