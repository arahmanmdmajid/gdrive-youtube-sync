// A class split over several recordings is titled "<slot title> | Part N".
// The slot it holds is the title without that suffix.
export function slotTitleOf(title: string | null): string | null {
  return title === null ? null : title.replace(/ \| Part \d+$/, "");
}

/**
 * Titles for a merge: the class split over two recordings, the earlier one Part 1. The other recording's title
 * is null when it has left review (its title is fixed), so only the one under review gets a Part N.
 */
export function mergedTitles(
  title: string,
  otherIsEarlier: boolean,
  otherInReview: boolean,
): { current: string; other: string | null } {
  return {
    current: `${title} | Part ${otherIsEarlier ? 2 : 1}`,
    other: otherInReview ? `${title} | Part ${otherIsEarlier ? 1 : 2}` : null,
  };
}
