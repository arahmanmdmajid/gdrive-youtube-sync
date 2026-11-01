import { z } from "zod/v4";

export const registerSchema = z.object({
  inviteCode: z.string().trim().min(1),
  username: z
    .string()
    .trim()
    .min(3)
    .max(30)
    .regex(/^[a-zA-Z0-9_.-]+$/, "Username may only contain letters, numbers, and _ . -"),
  password: z.string().min(6).max(100),
  displayName: z.string().trim().min(1).max(60),
});

export const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

export const progressSchema = z.object({
  status: z.enum(["not_started", "in_progress", "completed"]),
});

// Under a minute a day rounds to 0 minutes, which is not a plan.
export const studyPlanSchema = z.object({
  hoursPerDay: z.number().min(1 / 60).max(24),
  daysPerWeek: z.number().int().min(1).max(7).default(7),
});

export const resetPasswordSchema = z.object({
  password: z.string().min(6).max(100),
});

export const inviteCodeSchema = z.object({
  inviteCode: z.string().min(4).max(50),
});
