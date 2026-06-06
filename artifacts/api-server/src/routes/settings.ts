import { Router } from "express";
import { db, settingsTable } from "@workspace/db";
import { UpdateSettingsBody } from "@workspace/api-zod";
import { getSettings } from "../lib/settingsHelper";

const router = Router();

router.get("/settings", async (_req, res) => {
  const s = await getSettings();
  res.json(formatSettings(s));
});

router.put("/settings", async (req, res) => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const existing = await getSettings();
  if (existing) {
    const [updated] = await db.update(settingsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .returning();
    res.json(formatSettings(updated));
  } else {
    const [created] = await db.insert(settingsTable)
      .values({ ...parsed.data })
      .returning();
    res.json(formatSettings(created));
  }
});

function formatSettings(s: typeof settingsTable.$inferSelect | null) {
  if (!s) {
    return {
      driveFolderId: null,
      driveFolderName: null,
      youtubePlaylistId: null,
      youtubePlaylistName: null,
      autoSync: false,
      syncIntervalMinutes: 60,
    };
  }
  return {
    driveFolderId: s.driveFolderId ?? null,
    driveFolderName: s.driveFolderName ?? null,
    youtubePlaylistId: s.youtubePlaylistId ?? null,
    youtubePlaylistName: s.youtubePlaylistName ?? null,
    autoSync: s.autoSync,
    syncIntervalMinutes: s.syncIntervalMinutes,
  };
}

export default router;
