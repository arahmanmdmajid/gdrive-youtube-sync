import type { ClassSlot } from "./schedule";

/** One recording of the day. `startMin` is its estimated start in PKT, in minutes after midnight. */
export type TeacherRecording = {
  id: number;
  /** The teacher seen on screen, or null when the read found no name. */
  teacher: string | null;
  ambiguous?: boolean;
  startMin: number | null;
};

/** Why a recording is left to a person. */
export type TeacherLeftReason = "no_name" | "ambiguous" | "no_slot" | "too_many" | "no_start";

export type TeacherProposal = {
  id: number;
  /** The slot to title it from, or null when a person has to decide. */
  slot: ClassSlot | null;
  /** Its `| Part N` number, when the teacher has several recordings for one slot. A suggestion only. */
  part: number | null;
  reason: TeacherLeftReason | null;
};

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/**
 * Proposes a slot for each recording from the teacher seen on screen and that teacher's slots,
 * not from the recording's position in the day, so a class someone else skipped changes nothing.
 * `slots` are the day's slots (weekday and start date already applied); `recordings` are one
 * meeting code's recordings for the day, in recording order. Returns one proposal per recording, in order.
 *
 * One slot: that subject, and several recordings by the teacher become Part 1, Part 2. Two or more
 * slots: one recording takes the slot that starts nearest to it, as many recordings as slots take
 * them in time order, more are left to a person.
 */
export function proposeByTeacher(slots: ClassSlot[], recordings: TeacherRecording[]): TeacherProposal[] {
  const out = new Map<number, TeacherProposal>();
  const left = (id: number, reason: TeacherLeftReason) => out.set(id, { id, slot: null, part: null, reason });

  const byTeacher = new Map<string, TeacherRecording[]>();
  for (const r of recordings) {
    if (r.ambiguous) left(r.id, "ambiguous");
    else if (!r.teacher) left(r.id, "no_name");
    else byTeacher.set(r.teacher, [...(byTeacher.get(r.teacher) ?? []), r]);
  }

  for (const [teacher, mine] of byTeacher) {
    const own = slots.filter((s) => s.teacherEn === teacher).sort((a, b) => minutes(a.timeSlot) - minutes(b.timeSlot));
    const place = (r: TeacherRecording, slot: ClassSlot, part: number | null) => out.set(r.id, { id: r.id, slot, part, reason: null });

    if (own.length === 0) mine.forEach((r) => left(r.id, "no_slot"));
    else if (own.length === 1) mine.forEach((r, i) => place(r, own[0], mine.length > 1 ? i + 1 : null));
    else if (mine.length > own.length) mine.forEach((r) => left(r.id, "too_many"));
    else if (mine.length === 1) {
      const start = mine[0].startMin;
      if (start === null) left(mine[0].id, "no_start");
      else place(mine[0], own.reduce((best, s) => (Math.abs(minutes(s.timeSlot) - start) < Math.abs(minutes(best.timeSlot) - start) ? s : best)), null);
    } else mine.forEach((r, i) => place(r, own[i], null));
  }

  return recordings.map((r) => out.get(r.id)!);
}
