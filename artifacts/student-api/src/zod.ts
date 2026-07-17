import { z } from "zod/v4";

export const registerSchema = z.object({
  inviteCode: z.string().min(1),
  username: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-zA-Z0-9_.-]+$/, "Username may only contain letters, numbers, and _ . -"),
  password: z.string().min(6).max(100),
  displayName: z.string().min(1).max(60),
});

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const progressSchema = z.object({
  status: z.enum(["not_started", "in_progress", "completed"]),
});
