import { Router } from "express";
import { getYoutubeClient } from "../lib/youtubeClient";

const router = Router();

router.get("/youtube/playlists", async (req, res) => {
  try {
    const youtube = getYoutubeClient();
    if (!youtube) {
      res.json([]);
      return;
    }

    const response = await youtube.playlists.list({
      part: ["snippet", "contentDetails"],
      mine: true,
      maxResults: 50,
    });

    const playlists = response.data.items ?? [];
    res.json(
      playlists.map((p) => ({
        id: p.id ?? "",
        title: p.snippet?.title ?? "",
        itemCount: p.contentDetails?.itemCount ?? null,
      }))
    );
  } catch (err) {
    req.log.error({ err }, "Failed to list YouTube playlists");
    res.status(503).json({ error: "Failed to connect to YouTube" });
  }
});

export default router;
