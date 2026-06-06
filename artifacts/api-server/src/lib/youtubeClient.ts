import { google } from "googleapis";
import { getGoogleAuthClient } from "./googleAuth";

export function getYoutubeClient() {
  const auth = getGoogleAuthClient();
  if (!auth) return null;
  return google.youtube({ version: "v3", auth });
}
