import type { NextFunction, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const TOKEN_TTL = "30d";

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET environment variable is required");
  return secret;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export type UserRole = "student" | "admin";

export function signToken(userId: number, role: UserRole): string {
  return jwt.sign({ role }, jwtSecret(), { subject: String(userId), expiresIn: TOKEN_TTL });
}

export interface AuthedRequest extends Request {
  userId: number;
  role: UserRole;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  try {
    const payload = jwt.verify(token, jwtSecret());
    const sub = typeof payload === "object" ? payload.sub : null;
    const userId = Number(sub);
    if (!userId) throw new Error("missing sub");
    const role = typeof payload === "object" && payload.role === "admin" ? "admin" : "student";
    (req as AuthedRequest).userId = userId;
    (req as AuthedRequest).role = role;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
  }
}

/** Blocks admin-role accounts from student-only routes (subjects, lecture browsing, progress). */
export function requireStudentRole(req: Request, res: Response, next: NextFunction) {
  if ((req as AuthedRequest).role === "admin") {
    res.status(403).json({ error: "Admin accounts can only view class progress" });
    return;
  }
  next();
}
