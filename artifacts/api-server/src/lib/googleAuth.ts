import { google } from "googleapis";

// Singleton OAuth2 client — created once per process so the access token is cached
// and reused across all jobs instead of being re-fetched on every call.
let _authClient: InstanceType<typeof google.auth.OAuth2> | null = null;

/**
 * Returns the singleton Google OAuth2 client.
 * The access token is obtained lazily on first use and auto-refreshed by the
 * googleapis library when it expires — but only one token fetch per expiry
 * cycle, not one per job.
 */
export function getGoogleAuthClient() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  if (!_authClient) {
    _authClient = new google.auth.OAuth2(clientId, clientSecret);
    _authClient.setCredentials({ refresh_token: refreshToken });
  }

  return _authClient;
}

/** Clears the cached client (useful in tests or after credential rotation). */
export function resetGoogleAuthClient() {
  _authClient = null;
}
