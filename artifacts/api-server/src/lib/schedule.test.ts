// Slot start dates: a slot with a start day only counts for days on or after it.
// The pure rule runs everywhere; the lookups run against a real Postgres, only when TEST_DATABASE_URL points
// at a LOCAL database (see jobClaims.test.ts for how to set one up).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { isSlotInEffect } from "./slotInEffect";

const url = process.env.TEST_DATABASE_URL;
const skip = !url
  ? "TEST_DATABASE_URL is not set"
  : !/^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1)[:/]/.test(url)
    ? "TEST_DATABASE_URL must point at localhost"
    : false;

test("a slot with no start day always counts", () => {
  assert.equal(isSlotInEffect(null, "01-01-2020"), true);
  assert.equal(isSlotInEffect(null, "31-12-2099"), true);
});

test("a slot with a start day counts from that day on, not before", () => {
  assert.equal(isSlotInEffect("2026-10-05", "04-10-2026"), false);
  assert.equal(isSlotInEffect("2026-10-05", "05-10-2026"), true);
  assert.equal(isSlotInEffect("2026-10-05", "06-10-2026"), true);
});

test("the comparison is by date, not by text: month and year are weighed before the day", () => {
  assert.equal(isSlotInEffect("2026-10-05", "20-09-2026"), false); // later day-of-month, earlier month
  assert.equal(isSlotInEffect("2026-10-05", "01-11-2026"), true); // earlier day-of-month, later month
  assert.equal(isSlotInEffect("2026-10-05", "06-10-2025"), false);
  assert.equal(isSlotInEffect("2026-10-05", "01-01-2027"), true);
});

type Mods = {
  db: typeof import("@workspace/db").db;
  pool: typeof import("@workspace/db").pool;
  slotsTable: typeof import("@workspace/db").scheduleSlotsTable;
  sched: typeof import("./schedule");
  titles: typeof import("./titles");
  eq: typeof import("drizzle-orm").eq;
};
let m: Mods;
const DAY = 3; // a Wednesday: no real slots, so the test owns the day

const slot = (timeSlot: string, serial: string, subjectEn: string, effectiveFrom: string | null = null) => ({
  dayOfWeek: DAY, timeSlot, serial, subjectAr: "x", teacherAr: "x", subjectEn, teacherEn: "Ustad T", effectiveFrom,
});

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = url;
  const dbMod = await import("@workspace/db");
  const orm = await import("drizzle-orm");
  m = {
    db: dbMod.db,
    pool: dbMod.pool,
    slotsTable: dbMod.scheduleSlotsTable,
    sched: await import("./schedule"),
    titles: await import("./titles"),
    eq: orm.eq,
  };
  await m.db.delete(m.slotsTable).where(m.eq(m.slotsTable.dayOfWeek, DAY));
  await m.db.insert(m.slotsTable).values([
    slot("18:00", "4.2", "Tawzeeh Part 2"),
    slot("19:00", "1.2", "Jalalain Part 2"),
    slot("21:00", "4.1", "Tawzeeh Part 1", "2026-10-05"),
  ]);
});

after(async () => {
  if (skip || !m) return;
  await m.db.delete(m.slotsTable).where(m.eq(m.slotsTable.dayOfWeek, DAY));
  await m.pool.end();
});

test("a day before the start day sees the old slots, a day on or after it sees the new one too", { skip }, async () => {
  const before = await m.sched.getOrderedSlotsForDay(DAY, "30-09-2026");
  assert.deepEqual(before.map((s) => s.serial), ["4.2", "1.2"]);
  const onTheDay = await m.sched.getOrderedSlotsForDay(DAY, "05-10-2026");
  assert.deepEqual(onTheDay.map((s) => s.serial), ["4.2", "1.2", "4.1"]);
  const later = await m.sched.getOrderedSlotsForDay(DAY, "12-10-2026");
  assert.equal(later.length, 3);
});

test("the slots keep their time order whatever the start days", { skip }, async () => {
  const slots = await m.sched.getOrderedSlotsForDay(DAY, "12-10-2026");
  assert.deepEqual(slots.map((s) => s.timeSlot), ["18:00", "19:00", "21:00"]);
});

test("titling a day uses the slots of that day: the third recording gets the new class only from the start day", { skip }, async () => {
  const member = (id: string) => ({ id, locked: false, currentTitle: "", driveFileName: `uys-vqbk-mnn ${id}` });
  const members = [member("a"), member("b"), member("c")];
  const old = await m.titles.computeGroupAssignments(DAY, "30-09-2026", "uys-vqbk-mnn", members);
  const now = await m.titles.computeGroupAssignments(DAY, "12-10-2026", "uys-vqbk-mnn", members);
  assert.match(old.get("a")!.title, /^4\.2 /);
  assert.match(old.get("b")!.title, /^1\.2 /);
  assert.doesNotMatch(old.get("c")!.title, /^4\.1 /); // no slot left: falls back to the file name
  assert.match(now.get("c")!.title, /^4\.1 Tawzeeh Part 1 \| Ustad T \| 12-10-2026$/);
});

test("the clock-time lookup also ignores a slot that has not started yet", { skip }, async () => {
  // Wednesday 2026-09-30 and 2026-10-07, 21:00 PKT = 16:00 UTC
  assert.equal(await m.sched.resolveClassFromTime("2026-09-30T16:00:00Z"), null);
  assert.equal((await m.sched.resolveClassFromTime("2026-10-07T16:00:00Z"))?.serial, "4.1");
});
