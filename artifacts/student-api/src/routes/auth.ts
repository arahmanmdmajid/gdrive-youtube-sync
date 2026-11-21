import { Router, type Request, type Response } from "express";
import { db, usersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { hashPassword, verifyPassword, signToken, requireAuth, type AuthedRequest } from "../lib/auth";
import { getInviteCode } from "../lib/settings";
import { registerSchema, loginSchema, resetWithInviteSchema } from "../zod";
import { createAttemptLimiter } from "../lib/attemptLimiter";
import { logger } from "../lib/logger";

const router: Router = Router();

// Wrong invite codes on the reset route: limited per username and across all resets, so the shared code cannot
// be guessed quickly (issue #123). In memory: a restart clears it.
const resetByUser = createAttemptLimiter({ max: 5, windowMs: 15 * 60 * 1000 });
const resetAll = createAttemptLimiter({ max: 30, windowMs: 15 * 60 * 1000 });
const ALL = "all";

function publicUser(user: { id: number; username: string; displayName: string; role: string }) {
  return { id: user.id, username: user.username, displayName: user.displayName, role: user.role };
}

router.post("/register", async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const { inviteCode, username, password, displayName } = parsed.data;

  const effectiveCode = await getInviteCode();
  if (!effectiveCode || inviteCode !== effectiveCode) {
    res.status(403).json({ error: "Invalid invite code" });
    return;
  }

  const normalized = username.toLowerCase();
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.username, normalized)).limit(1);
  if (existing) {
    res.status(409).json({ error: "That username is already taken" });
    return;
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(usersTable)
    .values({ username: normalized, passwordHash, displayName })
    .returning();

  res.status(201).json({ token: signToken(user!.id, user!.role as "student" | "admin"), user: publicUser(user!) });
});

router.post("/login", async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Username and password are required" });
    return;
  }
  const { username, password } = parsed.data;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, username.toLowerCase()))
    .limit(1);

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    res.status(401).json({ error: "Incorrect username or password" });
    return;
  }

  res.json({ token: signToken(user.id, user.role as "student" | "admin"), user: publicUser(user) });
});

// A student who forgot their password proves who they are with the class invite code, then chooses a password
// (it may be the old one). Students only: the admin account is never reset this way. Never logs a password.
router.post("/reset-password", async (req: Request, res: Response) => {
  const parsed = resetWithInviteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const { inviteCode, username, password } = parsed.data;
  const normalized = username.toLowerCase();

  if (resetByUser.blocked(normalized) || resetAll.blocked(ALL)) {
    logger.warn({ username: normalized }, "Password reset refused: too many wrong invite codes");
    res.status(429).json({ error: "Too many wrong attempts. Try again in 15 minutes or ask your teacher." });
    return;
  }

  const effectiveCode = await getInviteCode();
  if (!effectiveCode || inviteCode !== effectiveCode) {
    resetByUser.fail(normalized);
    resetAll.fail(ALL);
    logger.warn({ username: normalized }, "Password reset refused: wrong invite code");
    res.status(403).json({ error: "Invalid invite code" });
    return;
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .update(usersTable)
    .set({ passwordHash })
    .where(and(eq(usersTable.username, normalized), eq(usersTable.role, "student")))
    .returning();
  if (!user) {
    res.status(404).json({ error: "No student account with that username" });
    return;
  }

  resetByUser.clear(normalized);
  logger.info({ userId: user.id, username: normalized }, "Password reset with the invite code");
  res.json({ token: signToken(user.id, "student"), user: publicUser(user) });
});

router.get("/me", requireAuth, async (req: Request, res: Response) => {
  const { userId } = req as AuthedRequest;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    res.status(401).json({ error: "Account no longer exists" });
    return;
  }
  res.json({ user: publicUser(user) });
});

export default router;
