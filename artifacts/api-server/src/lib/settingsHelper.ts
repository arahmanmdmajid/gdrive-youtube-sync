import { db, settingsTable } from "@workspace/db";

export async function getSettings() {
  const rows = await db.select().from(settingsTable).limit(1);
  return rows[0] ?? null;
}
