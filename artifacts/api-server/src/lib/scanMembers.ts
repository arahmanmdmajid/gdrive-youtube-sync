import type { GroupMember } from "./titles";
import { pktStartMinute } from "./titleByTeacher";

interface ScanFile {
  id?: string | null;
  name?: string | null;
  createdTime?: string | null;
}

interface ExistingJob {
  id?: number;
  durationSeconds?: number | null;
  proposedTitle: string | null;
  lectureNameConfirmed: boolean;
  status: string;
}

/**
 * The members of one day's positional pool, built from the files the scan sees (already in time order).
 * A rejected recording is left out: rejecting frees its slot, and `reflowGroupTitles` already leaves it out,
 * so keeping it here would hand its slot to it again on every scan and undo the shift the reject made.
 * A job that has left review, or whose name a person confirmed, is locked: its slot is reserved.
 */
export function scanGroupMembers(
  files: ScanFile[],
  existingByFileId: Map<string, ExistingJob>,
  teacherByJobId: Map<number, string | null> = new Map(),
): GroupMember[] {
  const members: GroupMember[] = [];
  for (const f of files) {
    if (!f.id || !f.createdTime) continue;
    const existing = existingByFileId.get(f.id);
    if (existing?.status === "rejected") continue;
    members.push({
      id: f.id,
      driveFileName: f.name ?? f.id,
      driveCreatedTime: f.createdTime,
      currentTitle: existing?.proposedTitle ?? null,
      locked: existing ? existing.lectureNameConfirmed || existing.status !== "needs_review" : false,
      ...(existing?.id !== undefined && teacherByJobId.has(existing.id)
        ? { teacher: teacherByJobId.get(existing.id), startMin: pktStartMinute(f.createdTime, existing.durationSeconds) }
        : {}),
    });
  }
  return members;
}
