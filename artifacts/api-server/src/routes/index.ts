import { Router, type IRouter } from "express";
import healthRouter from "./health";
import jobsRouter from "./jobs";
import driveRouter from "./drive";
import youtubeRouter from "./youtube";
import settingsRouter from "./settings";
import lectureNamesRouter from "./lectureNames";

const router: IRouter = Router();

router.use(healthRouter);
router.use(jobsRouter);
router.use(driveRouter);
router.use(youtubeRouter);
router.use(settingsRouter);
router.use(lectureNamesRouter);

export default router;
