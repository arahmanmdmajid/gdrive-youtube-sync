import { Router } from "express";
import authRouter from "./auth";
import studentRouter from "./student";
import adminRouter from "./admin";
import libraryRouter from "./library";
import audioRouter from "./audio";

const router: Router = Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true });
});

router.use("/auth", authRouter);
// audioRouter must be mounted before studentRouter/libraryRouter: those routers
// apply requireAuth unconditionally to everything that reaches them (not scoped
// to their own specific routes), so if mounted first they'd intercept and 401
// audio-stream requests before audioRouter — which is deliberately unauthenticated
// (see routes/audio.ts) — ever gets a chance to match.
router.use("/student", audioRouter);
router.use("/student", studentRouter);
router.use("/student", libraryRouter);
router.use("/admin", adminRouter);

export default router;
