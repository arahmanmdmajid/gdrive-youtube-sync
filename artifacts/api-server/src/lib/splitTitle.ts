// A class split over several recordings is titled "<slot title> | Part N".
// The slot it holds is the title without that suffix.
export function slotTitleOf(title: string | null): string | null {
  return title === null ? null : title.replace(/ \| Part \d+$/, "");
}
