import { Router } from "express";
import authRouter from "./auth";
import studentRouter from "./student";

const router: Router = Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true });
});

router.use("/auth", authRouter);
router.use("/student", studentRouter);

export default router;
