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
