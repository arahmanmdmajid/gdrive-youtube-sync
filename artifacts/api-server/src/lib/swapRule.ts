/**
 * A swap exchanges the stored titles of two recordings, so it is only allowed with a recording that is still in
 * review. One that has left review (approved, uploading, uploaded, failed, removed) has its title fixed.
 */
export const canSwapWith = (status: string): boolean => status === "needs_review";

export const SWAP_REFUSED_MESSAGE =
  "Cannot swap with a recording that has already left review (approved or uploaded): its title is fixed. Pick another name, or choose to keep both.";
