import { db, libraryResourcesTable, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getDriveClient } from "./driveClient";
import { FOLDER_NAME_TO_CATEGORY } from "./libraryCategories";
import { logger } from "./logger";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
}

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

async function listChildren(
  drive: NonNullable<ReturnType<typeof getDriveClient>>,
  folderId: string,
  mimeTypeFilter: string,
): Promise<DriveFile[]> {
  let files: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and ${mimeTypeFilter} and trashed = false`,
      fields: "nextPageToken,files(id,name,mimeType,size)",
      pageSize: 200,
      ...(pageToken ? { pageToken } : {}),
    });
    files = files.concat((response.data.files ?? []) as DriveFile[]);
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return files;
}

/** Strips the .pdf extension and collapses repeated whitespace/underscores for a cleaner display title. */
function cleanTitle(fileName: string): string {
  return fileName
    .replace(/\.pdf$/i, "")
    .replace(/[_\s]+/g, " ")
    .trim();
}

export async function scanLibraryFolder(): Promise<{
  scanned: number;
  inserted: number;
  skipped: number;
  unmappedFolders: string[];
}> {
  const [settings] = await db.select().from(settingsTable).limit(1);
  if (!settings?.libraryFolderId) {
    throw new Error("Library folder is not configured — set it in Settings first.");
  }

  const drive = getDriveClient();
  if (!drive) {
    throw new Error("Google Drive not configured. Please add OAuth credentials.");
  }

  const subfolders = await listChildren(drive, settings.libraryFolderId, `mimeType = '${FOLDER_MIME_TYPE}'`);

  let scanned = 0;
  let inserted = 0;
  let skipped = 0;
  const unmappedFolders: string[] = [];

  for (const folder of subfolders) {
    const category = FOLDER_NAME_TO_CATEGORY[folder.name];
    if (!category) {
      unmappedFolders.push(folder.name);
      continue;
    }

    const pdfs = await listChildren(drive, folder.id, "mimeType = 'application/pdf'");
    scanned += pdfs.length;

    for (const file of pdfs) {
      const [existing] = await db
        .select({ id: libraryResourcesTable.id })
        .from(libraryResourcesTable)
        .where(eq(libraryResourcesTable.driveFileId, file.id))
        .limit(1);
      if (existing) {
        skipped++;
        continue;
      }

      await db.insert(libraryResourcesTable).values({
        driveFileId: file.id,
        driveFileName: file.name,
        title: cleanTitle(file.name),
        category,
        sizeBytes: file.size ? Number(file.size) : null,
      });
      inserted++;
    }
  }

  logger.info({ scanned, inserted, skipped, unmappedFolders }, "Library scan complete");
  return { scanned, inserted, skipped, unmappedFolders };
}
