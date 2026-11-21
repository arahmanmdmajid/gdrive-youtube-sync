import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanUsername, clientIp, hashIp, summarizeEvents } from "./authEvents";

test("a username is trimmed, lower case and cut to 50 characters", () => {
  assert.equal(cleanUsername("  KhatTak "), "khattak");
  assert.equal(cleanUsername("x".repeat(80)).length, 50);
  assert.equal(cleanUsername(undefined), "");
  assert.equal(cleanUsername(42 as unknown), "");
});

test("the client address is the first one in x-forwarded-for, else the socket address", () => {
  assert.equal(clientIp({ "x-forwarded-for": "203.0.113.9, 10.0.0.2" }, "10.0.0.1"), "203.0.113.9");
  assert.equal(clientIp({ "x-forwarded-for": ["198.51.100.4"] }, "10.0.0.1"), "198.51.100.4");
  assert.equal(clientIp({}, "10.0.0.1"), "10.0.0.1");
  assert.equal(clientIp({}, undefined), "");
});

test("the hashed address is stable, salted, short, and not the address", () => {
  const a = hashIp("203.0.113.9", "salt-1");
  assert.equal(a, hashIp("203.0.113.9", "salt-1"));
  assert.notEqual(a, hashIp("203.0.113.9", "salt-2"));
  assert.notEqual(a, hashIp("203.0.113.10", "salt-1"));
  assert.equal(a?.length, 16);
  assert.ok(!a?.includes("203"));
});

test("no address gives no hash", () => {
  assert.equal(hashIp("", "salt"), null);
});

test("summary counts events in the last 24 hours and 7 days by kind", () => {
  const now = new Date("2026-11-21T12:00:00Z").getTime();
  const h = 3600 * 1000;
  const at = (hoursAgo: number, event: string) => ({ event, createdAt: new Date(now - hoursAgo * h) });
  const s = summarizeEvents(
    [at(1, "login_failed"), at(2, "login_ok"), at(30, "login_failed"), at(24 * 6, "login_failed"), at(24 * 8, "login_failed"), at(3, "reset_ok")],
    now,
  );
  assert.deepEqual(s.last24h, { login_ok: 1, login_failed: 1, register: 0, reset_ok: 1, reset_refused: 0 });
  assert.deepEqual(s.last7d, { login_ok: 1, login_failed: 3, register: 0, reset_ok: 1, reset_refused: 0 });
});

test("summary of nothing is all zero", () => {
  const s = summarizeEvents([], 0);
  assert.deepEqual(s.last24h, { login_ok: 0, login_failed: 0, register: 0, reset_ok: 0, reset_refused: 0 });
});
