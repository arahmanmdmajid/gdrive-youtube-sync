// One-off: files the old flat "Meet Recordings" archive into "<code> - YYYY/MM/DD" day folders
// under DRIVE_CONSOLIDATE_TARGET_FOLDER_ID. Moves only, never deletes. Dry-run unless --apply.
//
//   node --env-file=../../.env dist/scripts/mergeArchive.mjs --source <folderId> [--only YYYY-MM-DD] [--apply]
//
// --source is the archive folder, or a folder that holds exactly one folder named "Meet Recordings".
import { getDriveClient, listChildren, FOLDER_MIME_TYPE } from "../lib/driveClient";
import { planArchive } from "../lib/archiveMerge";
import { logMove } from "../lib/meetConsolidation";

const args = process.argv.slice(2);
const arg = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const apply = args.includes("--apply");
const only = arg("--only")?.replace(/-/g, "/"); // YYYY/MM/DD, as in the day folder names
const target = process.env.DRIVE_CONSOLIDATE_TARGET_FOLDER_ID;
const drive = getDriveClient();
let source = arg("--source");
if (!source || !target || !drive) {
  console.error("Needs --source <folderId>, DRIVE_CONSOLIDATE_TARGET_FOLDER_ID and Drive credentials");
  process.exit(1);
}

// Drive rate-limit and server errors are worth a few retries; anything else is a real failure.
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const e = err as { code?: number; errors?: { reason?: string }[] };
      const reason = e.errors?.[0]?.reason ?? "";
      const retryable = e.code === 429 || (typeof e.code === "number" && e.code >= 500) || /ateLimit|uotaExceeded/.test(reason);
      if (i >= 5 || !retryable) throw err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
}

const inner = (await listChildren(drive, source, `mimeType = '${FOLDER_MIME_TYPE}'`)).find((f) => f.name === "Meet Recordings");
if (inner) source = inner.id;

const files = (await listChildren(drive, source)).filter((f) => f.mimeType !== FOLDER_MIME_TYPE);
const subfolders = (await listChildren(drive, source, `mimeType = '${FOLDER_MIME_TYPE}'`)).map((f) => f.name);
const { groups, leftovers } = planArchive(files.map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType })));
for (const name of subfolders) leftovers.push({ name, reason: "subfolder, left in place" });

const wanted = [...groups].filter(([name]) => !only || name.endsWith(only)).sort(([a], [b]) => a.localeCompare(b));
const existing = new Map((await listChildren(drive, target, `mimeType = '${FOLDER_MIME_TYPE}'`)).map((f) => [f.name, f.id]));
const inGroups = [...groups.values()].reduce((n, g) => n + g.length, 0);
console.log(`source files: ${files.length} | in ${groups.size} day groups: ${inGroups} | left in place: ${leftovers.length - subfolders.length} + ${subfolders.length} subfolder(s)`);
console.log(`selected groups: ${wanted.length} | ${wanted.reduce((n, [, g]) => n + g.length, 0)} files | already in target: ${wanted.filter(([n]) => existing.has(n)).length}`);

let moved = 0, created = 0, failed = 0;
if (apply) {
  for (const [name, group] of wanted) {
    try {
      let dest = existing.get(name);
      if (!dest) {
        dest = (await withRetry(() => drive.files.create({ requestBody: { name, mimeType: FOLDER_MIME_TYPE, parents: [target] }, supportsAllDrives: true, fields: "id" }))).data.id!;
        existing.set(name, dest);
        created++;
      }
      for (const f of group) {
        await withRetry(() => drive.files.update({ fileId: f.id, addParents: dest, removeParents: source, supportsAllDrives: true, fields: "id" }));
        await logMove({ kind: "move", fileId: f.id, fromId: source, toId: dest });
        moved++;
      }
    } catch (err) {
      failed++; // the group is retried on the next run: moved files are no longer in the archive
      console.error(`group failed: ${name}`, (err as Error).message);
    }
  }
}
console.log(apply ? `applied: ${created} folders created, ${moved} files moved, ${failed} groups failed` : "dry run: nothing moved (add --apply)");
if (leftovers.length) {
  console.log("left in the archive:");
  for (const l of leftovers.slice(0, 40)) console.log(` - ${l.name} (${l.reason})`);
  if (leftovers.length > 40) console.log(` ... and ${leftovers.length - 40} more`);
}
process.exit(failed ? 1 : 0);
