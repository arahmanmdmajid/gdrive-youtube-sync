import { Router, type IRouter } from "express";
import healthRouter from "./health";
import jobsRouter from "./jobs";
import driveRouter from "./drive";
import youtubeRouter from "./youtube";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(jobsRouter);
router.use(driveRouter);
router.use(youtubeRouter);
router.use(settingsRouter);

export default router;
