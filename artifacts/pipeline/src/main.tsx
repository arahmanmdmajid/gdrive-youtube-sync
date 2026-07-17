import { createRoot } from "react-dom/client";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import { getToken } from "./lib/auth";
import "./index.css";

if (import.meta.env.VITE_API_URL) {
  setBaseUrl(import.meta.env.VITE_API_URL);
}
setAuthTokenGetter(() => getToken());

createRoot(document.getElementById("root")!).render(<App />);
