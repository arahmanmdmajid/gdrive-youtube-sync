// computeGroupAssignments with TITLE_BY_TEACHER on, against a real Postgres for the schedule slots
// (TEST_DATABASE_URL on localhost, see jobClaims.test.ts). The pure rules are in titleByTeacher.test.ts.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { GroupMember } from "./titles";

const url = process.env.TEST_DATABASE_URL;
const skip = !url
  ? "TEST_DATABASE_URL is not set"
  : !/^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1)[:/]/.test(url)
    ? "TEST_DATABASE_URL must point at localhost"
    : false;

type Mods = {
  db: typeof import("@workspace/db").db;
  pool: typeof import("@workspace/db").pool;
  slotsTable: typeof import("@workspace/db").scheduleSlotsTable;
  titles: typeof import("./titles");
  eq: typeof import("drizzle-orm").eq;
};
let m: Mods;
const DAY = 3; // a Wednesday (2026-09-30): no real slots, so the test owns the day
const DATE = "30-09-2026";
const title = (serial: string, subject: string, teacher: string) => `${serial} ${subject} | ${teacher} | ${DATE}`;
const A = title("1.1", "Alpha", "Ustad P");
const B = title("1.2", "Beta", "Ustad Q");
const C = title("1.3", "Gamma", "Ustad R");

const member = (id: string, teacher: string | null | undefined, locked = false, currentTitle: string | null = null): GroupMember => ({
  id,
  driveFileName: `uys-vqbk-mnn ${id}`,
  driveCreatedTime: "2026-09-30T14:00:00.000Z",
  currentTitle,
  locked,
  ...(teacher === undefined ? {} : { teacher }),
});

async function assign(members: GroupMember[], flag: "on" | "off") {
  const before = process.env.TITLE_BY_TEACHER;
  process.env.TITLE_BY_TEACHER = flag;
  try {
    const out = await m.titles.computeGroupAssignments(DAY, DATE, "uys-vqbk-mnn", members);
    return Object.fromEntries(members.filter((x) => !x.locked).map((x) => [x.id, out.get(x.id)!.title]));
  } finally {
    if (before === undefined) delete process.env.TITLE_BY_TEACHER;
    else process.env.TITLE_BY_TEACHER = before;
  }
}

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = url;
  const dbMod = await import("@workspace/db");
  const orm = await import("drizzle-orm");
  m = { db: dbMod.db, pool: dbMod.pool, slotsTable: dbMod.scheduleSlotsTable, titles: await import("./titles"), eq: orm.eq };
  await m.db.delete(m.slotsTable).where(m.eq(m.slotsTable.dayOfWeek, DAY));
  await m.db.insert(m.slotsTable).values(
    [["18:00", "1.1", "Alpha", "Ustad P"], ["18:30", "1.2", "Beta", "Ustad Q"], ["19:00", "1.3", "Gamma", "Ustad R"]].map(([timeSlot, serial, subjectEn, teacherEn]) => ({
      dayOfWeek: DAY, timeSlot, serial, subjectAr: "x", teacherAr: "x", subjectEn, teacherEn,
    })),
  );
});

after(async () => {
  if (skip || !m) return;
  await m.db.delete(m.slotsTable).where(m.eq(m.slotsTable.dayOfWeek, DAY));
  await m.pool.end();
});

test("a class someone else skipped: off follows the position, on follows the teacher", { skip }, async () => {
  const day = [member("x", "Ustad R"), member("y", "Ustad P")];
  assert.deepEqual(await assign(day, "off"), { x: A, y: B });
  assert.deepEqual(await assign(day, "on"), { x: C, y: A });
});

test("two recordings by one teacher become Part 1 and Part 2 of that teacher's slot", { skip }, async () => {
  const out = await assign([member("x", "Ustad Q"), member("y", "Ustad Q")], "on");
  assert.deepEqual(out, { x: `${B} | Part 1`, y: `${B} | Part 2` });
});

test("a recording with no read is walked over the slots the teacher proposals left", { skip }, async () => {
  // P and R are proposed Alpha and Gamma, so the unread one gets Beta, the only slot left.
  const out = await assign([member("x", "Ustad P"), member("u", undefined), member("z", "Ustad R")], "on");
  assert.deepEqual(out, { x: A, u: B, z: C });
});

test("a locked recording is never rewritten and keeps its slot out of the walk", { skip }, async () => {
  const out = await assign([member("done", "Ustad P", true, A), member("n", "Ustad Q"), member("u", undefined)], "on");
  assert.deepEqual(out, { n: B, u: C });
});

test("a teacher with no slot that day is walked positionally, like a recording with no read", { skip }, async () => {
  const out = await assign([member("x", "Ustad Nobody"), member("y", "Ustad Q")], "on");
  assert.deepEqual(out, { x: A, y: B });
});
