import { Router, type Request, type Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword, signToken, requireAuth, type AuthedRequest } from "../lib/auth";
import { getInviteCode } from "../lib/settings";
import { registerSchema, loginSchema } from "../zod";

const router: Router = Router();

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
