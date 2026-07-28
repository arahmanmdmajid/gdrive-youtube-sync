import fs from "node:fs";
import path from "node:path";

// The server is always started with cwd = artifacts/api-server (see package.json
// scripts and ecosystem.config.cjs), so this resolves reliably in dev and prod.
const THUMBNAILS_DIR = path.resolve(process.cwd(), "thumbnails");

const EXTENSIONS = [".jpg", ".jpeg", ".png"];

const SERIAL_RE = /^(\d+\.\d+)/;

/** Extracts the leading "N.N" subject serial from a title, or null if absent. */
export function extractSerial(title: string): string | null {
  return title.match(SERIAL_RE)?.[1] ?? null;
}

/**
 * Looks up an admin-provided thumbnail image for a subject serial.
 * Checks artifacts/api-server/thumbnails/{serial}.{jpg,jpeg,png} in order.
 * Returns the first match, or null if no thumbnail is configured.
 */
export function getSubjectThumbnailPath(serial: string): string | null {
  for (const ext of EXTENSIONS) {
    const candidate = path.join(THUMBNAILS_DIR, `${serial}${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}
