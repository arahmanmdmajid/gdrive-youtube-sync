/** A slot with a start date (YYYY-MM-DD) only counts for PKT days (DD-MM-YYYY) on or after it; with none it always counts. */
export function isSlotInEffect(effectiveFrom: string | null, pktDateStr: string): boolean {
  if (!effectiveFrom) return true;
  const [dd, mm, yyyy] = pktDateStr.split("-");
  return `${yyyy}-${mm}-${dd}` >= effectiveFrom;
}
