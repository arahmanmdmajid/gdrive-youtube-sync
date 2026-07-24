import { Router } from "express";
import authRouter from "./auth";
import studentRouter from "./student";
import adminRouter from "./admin";

const router: Router = Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true });
});

router.use("/auth", authRouter);
router.use("/student", studentRouter);
router.use("/admin", adminRouter);

export default router;
