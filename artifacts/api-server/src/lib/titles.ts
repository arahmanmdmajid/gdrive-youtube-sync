import { db, jobsTable } from "@workspace/db";
import { eq, notInArray } from "drizzle-orm";
import {
  buildYoutubeTitle,
  buildYoutubeDescription,
  buildYoutubeDescriptionFromSlot,
  buildYoutubeTitleFromSlot,
  extractMeetingCode,
  getOrderedSlotsForDay,
  getPktInfo,
} from "./schedule";
import { slotTitleOf } from "./splitTitle";
import { slotsHeldBy } from "./standIn";

export interface GroupMember {
  id: string;
  driveFileName: string;
  driveCreatedTime: string;
  currentTitle: string | null;
  // True once this job's slot must never be reassigned to someone else: either
  // a human confirmed it (lectureNameConfirmed), or it has already left
  // needs_review (pending/processing/done/failed). Only a still-needs_review,
  // unconfirmed job is "walkable" — up for (re)assignment by this pool-walk.
  locked: boolean;
}

/**
 * Computes title/description assignments for one (PKT date, meeting code) group.
 * Locked members are excluded from the pool entirely (their slot is reserved,
 * their own title untouched) so the walk never suggests an already-claimed name.
 * Non-locked members draw positionally from what's left, in the given order
 * (chronological by createdTime), falling back to a filename-derived title once
 * the day's schedule slots run out.
 */
export async function computeGroupAssignments(
  dayOfWeek: number,
  pktDateStr: string,
  meetingCode: string | null,
  membersChronological: GroupMember[],
): Promise<Map<string, { title: string; description: string }>> {
  const allSlots = meetingCode ? await getOrderedSlotsForDay(dayOfWeek, pktDateStr) : [];

  const lockedTitles = new Set(
    membersChronological.filter((m) => m.locked).map((m) => slotTitleOf(m.currentTitle)),
  );
  // A locked stand-in (a teacher teaching something else in his slot) holds that slot too.
  const standInHeld = new Set(slotsHeldBy(allSlots, [...lockedTitles]));
  const availableSlots = allSlots.filter(
    (slot) => !lockedTitles.has(buildYoutubeTitleFromSlot(slot, pktDateStr)) && !standInHeld.has(slot),
  );

  const assignments = new Map<string, { title: string; description: string }>();
  let nextSlotIdx = 0;
  for (const member of membersChronological) {
    if (member.locked) continue;

    const slot = availableSlots[nextSlotIdx];
    if (slot) {
      nextSlotIdx++;
      assignments.set(member.id, {
        title: buildYoutubeTitleFromSlot(slot, pktDateStr),
        description: buildYoutubeDescriptionFromSlot(slot, pktDateStr, member.driveFileName),
      });
    } else {
      // Overflow (more recordings than remaining schedule slots) or no meeting code
      assignments.set(member.id, {
        title: await buildYoutubeTitle(member.driveFileName, member.driveCreatedTime),
        description: await buildYoutubeDescription(member.driveFileName, member.driveCreatedTime),
      });
    }
  }
  return assignments;
}

/**
 * Re-derives titles for a single day+meeting-code group's still-unconfirmed
 * needs_review jobs, right now — instead of waiting for the next full pipeline
 * scan. Called after a reject or a manual correction, so removing a junk
 * duplicate (or fixing one job) immediately fixes up the rest of that day's
 * group rather than leaving them with stale, now-wrong guesses until whoever
 * is reviewing manually retitles each one.
 *
 * Includes every job that hasn't been rejected — not just needs_review ones —
 * so a slot already claimed by an approved/pending/done/removed job is never
 * handed out again to a still-unreviewed sibling. ("removed" still holds a
 * real YouTube video under that title, just currently off the playlist, so
 * its slot stays reserved too — only "rejected" truly frees one up.) Only
 * needs_review jobs are actually rewritten; anything else is read-only
 * context for slot protection.
 */
export async function reflowGroupTitles(driveCreatedTime: string, driveFileName: string): Promise<void> {
  const { dateStr, dayOfWeek } = getPktInfo(driveCreatedTime);
  const meetingCode = extractMeetingCode(driveFileName);

  const candidates = await db
    .select({
      id: jobsTable.id,
      status: jobsTable.status,
      driveCreatedTime: jobsTable.driveCreatedTime,
      driveFileName: jobsTable.driveFileName,
      proposedTitle: jobsTable.proposedTitle,
      lectureNameConfirmed: jobsTable.lectureNameConfirmed,
    })
    .from(jobsTable)
    .where(notInArray(jobsTable.status, ["rejected"]));

  const groupJobs = candidates
    .filter((j) => {
      if (!j.driveCreatedTime) return false;
      const info = getPktInfo(j.driveCreatedTime);
      if (info.dateStr !== dateStr) return false;
      if (meetingCode) {
        const jCode = extractMeetingCode(j.driveFileName ?? "");
        if (jCode !== meetingCode) return false;
      }
      return true;
    })
    .sort((a, b) => (a.driveCreatedTime ?? "").localeCompare(b.driveCreatedTime ?? ""));

  if (groupJobs.length === 0) return;

  const members: GroupMember[] = groupJobs.map((j) => ({
    id: String(j.id),
    driveFileName: j.driveFileName ?? "",
    driveCreatedTime: j.driveCreatedTime ?? "",
    currentTitle: j.proposedTitle,
    locked: j.lectureNameConfirmed || j.status !== "needs_review",
  }));

  const assignments = await computeGroupAssignments(dayOfWeek, dateStr, meetingCode, members);

  for (const j of groupJobs) {
    if (j.status !== "needs_review") continue; // read-only context — never rewrite it
    const assignment = assignments.get(String(j.id));
    if (!assignment || assignment.title === j.proposedTitle) continue;
    await db.update(jobsTable)
      .set({ proposedTitle: assignment.title, proposedDescription: assignment.description, updatedAt: new Date() })
      .where(eq(jobsTable.id, j.id));
  }
}
