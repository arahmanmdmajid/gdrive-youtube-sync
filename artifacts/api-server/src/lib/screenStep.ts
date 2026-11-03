import { logger } from "./logger";
import { readScreenCheck } from "./autoReviewMode";
import type { ScreenRunSummary } from "./screenReads";

export interface ScreenStepOptions {
  /** SCREEN_CHECK. */
  enabled?: boolean;
  limit?: number;
  /** For tests: the reader. The default is loaded only when needed, so a test needs no database. */
  reads?: (limit: number) => Promise<ScreenRunSummary>;
}

/** Recordings read per tick. One: each read takes four seeks in the Drive file and four full-screen OCR passes. */
export const SCREEN_READS_PER_TICK = 1;

/**
 * The end of a worker tick: read the open book of a recording or two. Does nothing unless SCREEN_CHECK=on.
 * It runs last in the tick, so it never delays an upload, and it never throws: a failure is logged and
 * the tick carries on.
 */
export async function runScreenStep(opts: ScreenStepOptions = {}): Promise<{ ran: boolean; attempted: number }> {
  if (!(opts.enabled ?? readScreenCheck())) return { ran: false, attempted: 0 };
  try {
    const reads = opts.reads ?? (async (n: number) => (await import("./screenReads")).runScreenReads(n));
    const summary = await reads(opts.limit ?? SCREEN_READS_PER_TICK);
    return { ran: true, attempted: summary.attempted };
  } catch (err) {
    // Never stops the tick. The error is ours (database, reader), never frames or recognized text.
    logger.error({ err }, "Screen reads failed");
    return { ran: true, attempted: 0 };
  }
}
