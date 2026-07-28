import path from "node:path";
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { startPipelineWorker } from "./lib/pipeline";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Local-only admin server, no public exposure — safe to serve thumbnail
// images (subject-level and per-video overrides) directly for UI previews.
app.use("/api/thumbnail-files", express.static(path.resolve(process.cwd(), "thumbnails")));

app.use("/api", router);

startPipelineWorker();

export default app;
