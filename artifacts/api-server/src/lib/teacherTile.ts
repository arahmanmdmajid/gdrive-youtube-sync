// Identifies the teacher on screen from the text read off a recording's name tile (the tile at the right
// of the frame that shows the participant's display name or alias).
//
// Pure on purpose: no imports, no frames, no files. The caller reads the tile (that part stays on this
// machine and never stores the text) and passes the recognized text here. Only the verdict leaves this
// function. Two teachers matching is "ambiguous", never a guess. See issue #27 and #42.

/**
 * How one teacher shows up on screen. Words are compared whole, lower case.
 * - `strong`: any one of these identifies the teacher (a distinctive name or alias).
 * - `allOf`: every one of these must appear (an alias such as "A Sh", where one letter alone proves nothing).
 * - `weak`: common names or labels (a first name, a title). They only count when at least two different
 *   ones appear, because a student or another teacher can share one.
 */
export interface AliasEntry {
  teacher: string;
  strong?: string[];
  allOf?: string[];
  weak?: string[];
}

export interface TeacherReading {
  /** The teacher identified, or null when nobody matched or more than one did. */
  teacher: string | null;
  /** True when more than one teacher matched. */
  ambiguous: boolean;
  /** Every teacher that matched (one when `teacher` is set, several when ambiguous, none otherwise). */
  matched: string[];
  /** In how many of the frames the chosen teacher matched on its own. 0 when no teacher is chosen. */
  framesMatched: number;
  frames: number;
}

/** The words of a text: runs of letters, lower case. */
export function wordsOf(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/\p{L}+/gu) ?? []));
}

function lower(list: string[] | undefined): string[] {
  return (list ?? []).map((w) => w.toLowerCase()).filter(Boolean);
}

/** True if the words identify this entry's teacher. */
export function matchesEntry(words: Set<string>, entry: AliasEntry): boolean {
  if (lower(entry.strong).some((w) => words.has(w))) return true;
  const allOf = lower(entry.allOf);
  if (allOf.length > 0 && allOf.every((w) => words.has(w))) return true;
  const weak = new Set(lower(entry.weak).filter((w) => words.has(w)));
  return weak.size >= 2;
}

/**
 * Reads the teacher from the text of each frame's name-tile crop. The frames of one recording are
 * combined: an alias shows in some frames and not others (the camera turns on and off).
 */
export function readTeacher(frameTexts: string[], aliases: AliasEntry[]): TeacherReading {
  const perFrame = frameTexts.map(wordsOf);
  const union = new Set<string>();
  for (const w of perFrame) for (const x of w) union.add(x);

  const matched = aliases.filter((a) => matchesEntry(union, a)).map((a) => a.teacher);
  const frames = frameTexts.length;
  if (matched.length !== 1) return { teacher: null, ambiguous: matched.length > 1, matched, framesMatched: 0, frames };

  const entry = aliases.find((a) => a.teacher === matched[0])!;
  return {
    teacher: matched[0],
    ambiguous: false,
    matched,
    framesMatched: perFrame.filter((w) => matchesEntry(w, entry)).length,
    frames,
  };
}
