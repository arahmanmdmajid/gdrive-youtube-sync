// Tests for the saved study commitment. The validation tests need nothing. The tests marked "database"
// need a real Postgres: set TEST_DATABASE_URL to a LOCAL database, as in api-server's jobClaims.test.ts:
//   docker run -d --name dtt-test-pg -e POSTGRES_PASSWORD=test -p 54329:5432 postgres:16-alpine
//   DATABASE_URL=postgres://postgres:test@localhost:54329/postgres pnpm --filter @workspace/db run push-force
//   TEST_DATABASE_URL=postgres://postgres:test@localhost:54329/postgres pnpm --filter @workspace/student-api run test
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { studyPlanSchema } from "../zod";

const parse = (body: unknown) => studyPlanSchema.safeParse(body);

test("a plan needs hours per day and defaults to 7 study days a week", () => {
  const ok = parse({ hoursPerDay: 2 });
  assert.ok(ok.success);
  assert.deepEqual(ok.data, { hoursPerDay: 2, daysPerWeek: 7 });
  assert.deepEqual(parse({ hoursPerDay: 1.5, daysPerWeek: 5 }).data, { hoursPerDay: 1.5, daysPerWeek: 5 });
});

test("hours per day must be above 0 and at most 24", () => {
  assert.equal(parse({ hoursPerDay: 24 }).success, true);
  assert.equal(parse({ hoursPerDay: 0 }).success, false);
  assert.equal(parse({ hoursPerDay: -1 }).success, false);
  assert.equal(parse({ hoursPerDay: 24.5 }).success, false);
  assert.equal(parse({ hoursPerDay: 0.001 }).success, false, "under a minute a day is not a plan");
  assert.equal(parse({ hoursPerDay: "2" }).success, false);
  assert.equal(parse({ hoursPerDay: null }).success, false);
  assert.equal(parse({}).success, false);
});

test("study days per week must be a whole number from 1 to 7", () => {
  for (const daysPerWeek of [1, 7]) assert.equal(parse({ hoursPerDay: 1, daysPerWeek }).success, true);
  for (const daysPerWeek of [0, 8, 1.5, -2, "3"]) assert.equal(parse({ hoursPerDay: 1, daysPerWeek }).success, false);
});

// ── database ───────────────────────────────────────────────────────────────

const url = process.env.TEST_DATABASE_URL;
const skip = !url
  ? "TEST_DATABASE_URL is not set"
  : !/^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1)[:/]/.test(url)
    ? "TEST_DATABASE_URL must point at localhost"
    : false;

type Mods = {
  db: typeof import("@workspace/db").db;
  pool: typeof import("@workspace/db").pool;
  usersTable: typeof import("@workspace/db").usersTable;
  studyPlansTable: typeof import("@workspace/db").studyPlansTable;
  plans: typeof import("./studyPlan");
  eq: typeof import("drizzle-orm").eq;
  inArray: typeof import("drizzle-orm").inArray;
};
let m: Mods;
const created: number[] = [];
let seq = 0;

before(async () => {
  if (skip) return;
  process.env.DATABASE_URL = url; // read when @workspace/db is first imported
  const dbMod = await import("@workspace/db");
  const orm = await import("drizzle-orm");
  m = {
    db: dbMod.db,
    pool: dbMod.pool,
    usersTable: dbMod.usersTable,
    studyPlansTable: dbMod.studyPlansTable,
    plans: await import("./studyPlan"),
    eq: orm.eq,
    inArray: orm.inArray,
  };
});

after(async () => {
  if (skip || !m) return;
  if (created.length) await m.db.delete(m.usersTable).where(m.inArray(m.usersTable.id, created));
  await m.pool.end();
});

async function newUser() {
  const [row] = await m.db
    .insert(m.usersTable)
    .values({ username: `test-${Date.now()}-${seq++}`, passwordHash: "x", displayName: "T" })
    .returning();
  created.push(row.id);
  return row.id;
}

test("database: a student with no saved plan gets null", { skip }, async () => {
  assert.equal(await m.plans.getStudyPlan(await newUser()), null);
});

test("database: a saved plan is read back", { skip }, async () => {
  const id = await newUser();
  await m.plans.saveStudyPlan(id, { hoursPerDay: 1.5, daysPerWeek: 5 });
  assert.deepEqual(await m.plans.getStudyPlan(id), { hoursPerDay: 1.5, daysPerWeek: 5 });
});

test("database: saving again replaces the plan and keeps one row", { skip }, async () => {
  const id = await newUser();
  await m.plans.saveStudyPlan(id, { hoursPerDay: 1, daysPerWeek: 7 });
  await m.plans.saveStudyPlan(id, { hoursPerDay: 3.25, daysPerWeek: 4 });
  assert.deepEqual(await m.plans.getStudyPlan(id), { hoursPerDay: 3.25, daysPerWeek: 4 });
  const rows = await m.db.select().from(m.studyPlansTable).where(m.eq(m.studyPlansTable.userId, id));
  assert.equal(rows.length, 1);
});

test("database: students do not see each other's plans", { skip }, async () => {
  const a = await newUser();
  const b = await newUser();
  await m.plans.saveStudyPlan(a, { hoursPerDay: 2, daysPerWeek: 7 });
  assert.equal(await m.plans.getStudyPlan(b), null);
});

test("database: removing a student removes their plan", { skip }, async () => {
  const id = await newUser();
  await m.plans.saveStudyPlan(id, { hoursPerDay: 2, daysPerWeek: 7 });
  await m.db.delete(m.usersTable).where(m.eq(m.usersTable.id, id));
  const rows = await m.db.select().from(m.studyPlansTable).where(m.eq(m.studyPlansTable.userId, id));
  assert.equal(rows.length, 0);
});
