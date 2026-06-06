import { google } from "googleapis";

export function getYoutubeClient() {
  const token = process.env.YOUTUBE_ACCESS_TOKEN;
  if (!token) return null;

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: token });
  return google.youtube({ version: "v3", auth });
}
