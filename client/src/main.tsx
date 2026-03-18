import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Global fetch interceptor: auto-attach CSRF token for mutating API requests
const originalFetch = window.fetch;
window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
  if (init?.method && !["GET", "HEAD", "OPTIONS"].includes(init.method.toUpperCase())) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("/api/") || url.startsWith(window.location.origin + "/api/")) {
      const csrfMatch = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]*)/);
      if (csrfMatch) {
        const headers = new Headers(init.headers);
        if (!headers.has("X-CSRF-Token")) {
          headers.set("X-CSRF-Token", decodeURIComponent(csrfMatch[1]));
        }
        init = { ...init, headers };
      }
    }
  }
  return originalFetch.call(window, input, init);
};

createRoot(document.getElementById("root")!).render(<App />);
