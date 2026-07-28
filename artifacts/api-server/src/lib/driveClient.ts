import { google } from "googleapis";
import { getGoogleAuthClient } from "./googleAuth";

export function getDriveClient() {
  const auth = getGoogleAuthClient();
  if (!auth) return null;
  return google.drive({ version: "v3", auth });
}

export async function streamDriveFile(fileId: string): Promise<NodeJS.ReadableStream> {
  const drive = getDriveClient();
  if (!drive) throw new Error("Google Drive not configured. Please add OAuth credentials.");
  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "stream" }
  );
  return response.data as unknown as NodeJS.ReadableStream;
}

export interface DriveChildFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
}

export const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

/** Lists all children of a Drive folder, optionally filtered by mimeType (e.g. "mimeType = 'application/pdf'"). */
export async function listChildren(
  drive: NonNullable<ReturnType<typeof getDriveClient>>,
  folderId: string,
  mimeTypeFilter?: string,
): Promise<DriveChildFile[]> {
  let files: DriveChildFile[] = [];
  let pageToken: string | undefined;

  do {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false${mimeTypeFilter ? ` and ${mimeTypeFilter}` : ""}`,
      fields: "nextPageToken,files(id,name,mimeType,size)",
      pageSize: 200,
      ...(pageToken ? { pageToken } : {}),
    });
    files = files.concat((response.data.files ?? []) as DriveChildFile[]);
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return files;
}
