/**
 * A slot with a start date (YYYY-MM-DD) only counts for PKT days (DD-MM-YYYY) on or after it, and one with an end
 * date (the last class day) only up to and including it. With neither it always counts.
 */
export function isSlotInEffect(effectiveFrom: string | null, pktDateStr: string, effectiveUntil: string | null = null): boolean {
  const [dd, mm, yyyy] = pktDateStr.split("-");
  const day = `${yyyy}-${mm}-${dd}`;
  return (!effectiveFrom || day >= effectiveFrom) && (!effectiveUntil || day <= effectiveUntil);
}
