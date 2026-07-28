import { google } from "googleapis";

// Singleton OAuth2 client, mirroring artifacts/api-server/src/lib/googleAuth.ts —
// student-api only needs read access to stream already-approved audio files,
// not the full Drive/YouTube upload capability api-server has.
let _authClient: InstanceType<typeof google.auth.OAuth2> | null = null;

export function getDriveClient() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;

  if (!_authClient) {
    _authClient = new google.auth.OAuth2(clientId, clientSecret);
    _authClient.setCredentials({ refresh_token: refreshToken });
  }
  return google.drive({ version: "v3", auth: _authClient });
}
