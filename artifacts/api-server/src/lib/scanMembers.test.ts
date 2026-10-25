// Which recordings the scan puts in a day's positional pool. The member tests are pure; the assignment tests
// need a real Postgres (TEST_DATABASE_URL on localhost, see jobClaims.test.ts) for the schedule slots.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { scanGroupMembers } from "./scanMembers";

const url = process.env.TEST_DATABASE_URL;
const skip = !url
  ? "TEST_DATABASE_URL is not set"
  : !/^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1)[:/]/.test(url)
    ? "TEST_DATABASE_URL must point at localhost"
    : false;

const file = (id: string, minute: number) => ({ id, name: `uys-vqbk-mnn ${id}`, createdTime: `2026-10-01T14:${String(minute).padStart(2, "0")}:00.000Z` });
const job = (status: string, proposedTitle: string | null = null, lectureNameConfirmed = false) => ({ status, proposedTitle, lectureNameConfirmed });

test("a rejected recording is not a member of the pool", () => {
  const existing = new Map([["r", job("rejected", "1.1 A | T | 01-10-2026")], ["a", job("needs_review")]]);
  const members = scanGroupMembers([file("r", 0), file("a", 10)], existing);
  assert.deepEqual(members.map((m) => m.id), ["a"]);
});

test("every other recording stays a member, in the order given", () => {
  const existing = new Map([["b", job("needs_review")]]);
  const members = scanGroupMembers([file("a", 0), file("b", 10), file("c", 20)], existing);
  assert.deepEqual(members.map((m) => m.id), ["a", "b", "c"]);
});

test("locked: confirmed by a person, or already out of review; not locked: new, or unconfirmed in review", () => {
  const existing = new Map([
    ["conf", job("needs_review", "t", true)],
    ["pend", job("pending", "t")],
    ["done", job("done", "t")],
    ["fail", job("failed", "t")],
    ["rev", job("needs_review", "t")],
  ]);
  const members = scanGroupMembers([file("conf", 0), file("pend", 1), file("done", 2), file("fail", 3), file("rev", 4), file("new", 5)], existing);
  assert.deepEqual(Object.fromEntries(members.map((m) => [m.id, m.locked])), { conf: true, pend: true, done: true, fail: true, rev: false, new: false });
});

test("a file without an id or a time is left out, and a missing name falls back to the id", () => {
  const members = scanGroupMembers([{ id: "x", name: null, createdTime: "2026-10-01T14:00:00.000Z" }, { id: null, createdTime: "2026-10-01T14:10:00.000Z" }, { id: "y", createdTime: null }], new Map());
  assert.deepEqual(members.map((m) => [m.id, m.driveFileName]), [["x", "x"]]);
});

type Mods = {
  db: typeof import("@workspace/db").db;
  pool: typeof import("@workspace/db").pool;
  slotsTable: typeof import("@workspace/db").scheduleSlotsTable;
  titles: typeof import("./titles");
  eq: typeof import("drizzle-orm").eq;
};
let m: Mods;
const DAY = 4; // a Thursday (2026-10-01): no real slots, so the test owns the day
const DATE = "01-10-2026";

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = url;
  const dbMod = await import("@workspace/db");
  const orm = await import("drizzle-orm");
  m = { db: dbMod.db, pool: dbMod.pool, slotsTable: dbMod.scheduleSlotsTable, titles: await import("./titles"), eq: orm.eq };
  await m.db.delete(m.slotsTable).where(m.eq(m.slotsTable.dayOfWeek, DAY));
  await m.db.insert(m.slotsTable).values(
    [["18:00", "1.1", "Alpha"], ["18:30", "1.2", "Beta"], ["19:00", "1.3", "Gamma"]].map(([timeSlot, serial, subjectEn]) => ({
      dayOfWeek: DAY, timeSlot, serial, subjectAr: "x", teacherAr: "x", subjectEn, teacherEn: "Ustad T",
    })),
  );
});

after(async () => {
  if (skip || !m) return;
  await m.db.delete(m.slotsTable).where(m.eq(m.slotsTable.dayOfWeek, DAY));
  await m.pool.end();
});

const title = (serial: string, subject: string) => `${serial} ${subject} | Ustad T | ${DATE}`;

test("a rejected first recording frees its slot: the next ones take the first slots, as after the reject", { skip }, async () => {
  const existing = new Map([["r", job("rejected", title("1.1", "Alpha"))], ["a", job("needs_review", title("1.2", "Beta"))], ["b", job("needs_review", title("1.3", "Gamma"))]]);
  const members = scanGroupMembers([file("r", 0), file("a", 10), file("b", 20)], existing);
  const out = await m.titles.computeGroupAssignments(DAY, DATE, "uys-vqbk-mnn", members);
  assert.equal(out.get("a")!.title, title("1.1", "Alpha"));
  assert.equal(out.get("b")!.title, title("1.2", "Beta"));
  assert.equal(out.has("r"), false, "the rejected recording is given nothing");
});

test("after the first is approved with the freed slot, the second keeps the next slot (the case that flipped back)", { skip }, async () => {
  const existing = new Map([["r", job("rejected", title("1.1", "Alpha"))], ["a", job("pending", title("1.1", "Alpha"))], ["b", job("needs_review", title("1.2", "Beta"))]]);
  const members = scanGroupMembers([file("r", 0), file("a", 10), file("b", 20)], existing);
  const out = await m.titles.computeGroupAssignments(DAY, DATE, "uys-vqbk-mnn", members);
  assert.equal(out.get("b")!.title, title("1.2", "Beta"));
});

test("with no rejected recording nothing changes: positions still follow time order", { skip }, async () => {
  const members = scanGroupMembers([file("a", 0), file("b", 10), file("c", 20)], new Map());
  const out = await m.titles.computeGroupAssignments(DAY, DATE, "uys-vqbk-mnn", members);
  assert.deepEqual(["a", "b", "c"].map((id) => out.get(id)!.title), [title("1.1", "Alpha"), title("1.2", "Beta"), title("1.3", "Gamma")]);
});
