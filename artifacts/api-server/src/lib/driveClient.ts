import { google } from "googleapis";

let _driveClient: ReturnType<typeof google.drive> | null = null;

export function getDriveClient() {
  const token = process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
  if (!token) return null;

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: token });
  return google.drive({ version: "v3", auth });
}

export async function streamDriveFile(fileId: string): Promise<NodeJS.ReadableStream> {
  const drive = getDriveClient();
  if (!drive) throw new Error("Google Drive not configured");
  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "stream" }
  );
  return response.data as unknown as NodeJS.ReadableStream;
}
