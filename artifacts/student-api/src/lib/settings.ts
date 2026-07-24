import { db, settingsTable } from "@workspace/db";

export async function getInviteCode(): Promise<string | null> {
  const [row] = await db.select({ inviteCode: settingsTable.inviteCode }).from(settingsTable).limit(1);
  return row?.inviteCode ?? process.env.INVITE_CODE ?? null;
}

export async function setInviteCode(code: string): Promise<string> {
  const [existing] = await db.select().from(settingsTable).limit(1);
  if (existing) {
    const [updated] = await db
      .update(settingsTable)
      .set({ inviteCode: code, updatedAt: new Date() })
      .returning();
    return updated!.inviteCode!;
  }
  const [created] = await db.insert(settingsTable).values({ inviteCode: code }).returning();
  return created!.inviteCode!;
}
