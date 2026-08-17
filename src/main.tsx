import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import "./styles.css";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
if ("serviceWorker" in navigator && import.meta.env.PROD)
  window.addEventListener("load", () =>
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) =>
        reg.addEventListener("updatefound", () =>
          reg.installing?.addEventListener("statechange", () => {
            if (
              reg.installing?.state === "installed" &&
              navigator.serviceWorker.controller
            )
              window.dispatchEvent(new CustomEvent("storyos-update"));
          }),
        ),
      )
      .catch(() => undefined),
  );
else if ("serviceWorker" in navigator && import.meta.env.DEV) {
  void navigator.serviceWorker
    .getRegistrations()
    .then((registrations) =>
      Promise.all(
        registrations.map((registration) => registration.unregister()),
      ),
    );
  if ("caches" in window)
    void caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("story-os-"))
            .map((key) => caches.delete(key)),
        ),
      );
}
