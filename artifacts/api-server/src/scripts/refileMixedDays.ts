// One-off: moves files that sit in the wrong "<code> - YYYY/MM/DD" day folder under
// DRIVE_CONSOLIDATE_TARGET_FOLDER_ID into the folder for the day in their own name (#22).
// Moves only, never deletes. Dry-run unless --apply.
//
//   node --env-file=../../.env dist/scripts/refileMixedDays.mjs [--only YYYY-MM-DD] [--apply]
//
// --only limits the run to files whose own day is that date.
import { getDriveClient, listChildren, FOLDER_MIME_TYPE } from "../lib/driveClient";
import { fileDay } from "../lib/archiveMerge";
import { withRetry } from "../lib/driveRetry";
import { logMove } from "../lib/meetConsolidation";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const onlyArg = args.indexOf("--only");
const only = onlyArg >= 0 ? args[onlyArg + 1]?.replace(/-/g, "/") : undefined; // YYYY/MM/DD
const target = process.env.DRIVE_CONSOLIDATE_TARGET_FOLDER_ID;
const drive = getDriveClient();
if (!target || !drive) {
  console.error("Needs DRIVE_CONSOLIDATE_TARGET_FOLDER_ID and Drive credentials");
  process.exit(1);
}

const DAY_FOLDER = /^(.+) - (\d{4}\/\d{2}\/\d{2})$/;
const today = new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10).replace(/-/g, "/");

const folders = (await listChildren(drive, target, `mimeType = '${FOLDER_MIME_TYPE}'`)).flatMap((f) => {
  const m = f.name.match(DAY_FOLDER);
  return m ? [{ id: f.id, name: f.name, code: m[1]!, day: m[2]! }] : [];
});
const existing = new Map(folders.map((f) => [f.name, f.id]));

// destination folder name -> the files that belong in it
const plan = new Map<string, { id: string; from: string }[]>();
const unreadable: string[] = [];
const sources = new Set<string>();
for (const f of folders) {
  for (const i of await withRetry(() => listChildren(drive, f.id))) {
    if (i.mimeType === FOLDER_MIME_TYPE) continue;
    const day = fileDay(i.name);
    if (!day) { unreadable.push(`${f.name}: ${i.name}`); continue; }
    // Right folder already, today's file (maybe still processing), or outside --only.
    if (day === f.day || day === today || (only && day !== only)) continue;
    const dest = `${f.code} - ${day}`;
    plan.set(dest, [...(plan.get(dest) ?? []), { id: i.id, from: f.id }]);
    sources.add(f.name);
  }
}

const total = [...plan.values()].reduce((n, g) => n + g.length, 0);
console.log(`day folders: ${folders.length} | files to refile: ${total} from ${sources.size} folders into ${plan.size} day folders (${[...plan.keys()].filter((n) => !existing.has(n)).length} new)`);
console.log(`names with no readable date, left alone: ${unreadable.length}`);
for (const u of unreadable.slice(0, 10)) console.log(` - ${u}`);

let moved = 0, created = 0, failed = 0;
if (apply) {
  for (const [name, group] of [...plan].sort(([a], [b]) => a.localeCompare(b))) {
    try {
      let dest = existing.get(name);
      if (!dest) {
        dest = (await withRetry(() => drive.files.create({ requestBody: { name, mimeType: FOLDER_MIME_TYPE, parents: [target] }, supportsAllDrives: true, fields: "id" }))).data.id!;
        existing.set(name, dest);
        created++;
      }
      for (const f of group) {
        await withRetry(() => drive.files.update({ fileId: f.id, addParents: dest, removeParents: f.from, supportsAllDrives: true, fields: "id" }));
        await logMove({ kind: "move", fileId: f.id, fromId: f.from, toId: dest });
        moved++;
      }
    } catch (err) {
      failed++; // retried on the next run: a moved file is already in the right folder
      console.error(`group failed: ${name}`, (err as Error).message);
    }
  }
}
console.log(apply ? `applied: ${created} folders created, ${moved} files moved, ${failed} groups failed` : "dry run: nothing moved (add --apply)");
process.exit(failed ? 1 : 0);
