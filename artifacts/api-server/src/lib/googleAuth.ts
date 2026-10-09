import { google } from "googleapis";

// Two singleton OAuth2 clients, one per Google account this pipeline talks to:
//   - YouTube uploads always go to the channel owned by GOOGLE_OAUTH_REFRESH_TOKEN's
//     account.
//   - Drive access uses its own refresh token (GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN) —
//     the account that actually hosts the Meet recordings — so its own
//     "Google Meet" folders can be listed directly instead of relying on
//     link-shared access to another account's folders. Both accounts share the
//     same registered OAuth app (Client ID/Secret identify the app, not the
//     consenting user), so only the refresh token differs.
// Each client is created once per process so its access token is cached and
// reused across calls instead of being re-fetched every time.
let _youtubeAuthClient: InstanceType<typeof google.auth.OAuth2> | null = null;
let _driveAuthClient: InstanceType<typeof google.auth.OAuth2> | null = null;

function buildAuthClient(refreshToken: string | undefined) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret || !refreshToken) return null;

  const client = new google.auth.OAuth2(clientId, clientSecret);
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

/** Returns the singleton OAuth2 client used for YouTube uploads. */
export function getGoogleAuthClient() {
  if (!_youtubeAuthClient) {
    _youtubeAuthClient = buildAuthClient(process.env.GOOGLE_OAUTH_REFRESH_TOKEN);
  }
  return _youtubeAuthClient;
}

/**
 * Returns the singleton OAuth2 client used for Drive access. Falls back to
 * the YouTube credential when GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN isn't set, so
 * a single-account setup keeps working unchanged.
 */
export function getGoogleDriveAuthClient() {
  if (!_driveAuthClient) {
    _driveAuthClient = buildAuthClient(process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN) ?? getGoogleAuthClient();
  }
  return _driveAuthClient;
}
