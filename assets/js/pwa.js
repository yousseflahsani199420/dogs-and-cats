import { getSiteBaseUrl, scheduleIdleWork } from "./utils.js";

export function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      scheduleIdleWork(() => {
        const basePath = new URL(getSiteBaseUrl()).pathname.replace(/\/$/, "");
        const serviceWorkerPath = `${basePath || ""}/service-worker.js`;
        const scope = `${basePath || ""}/`;
        navigator.serviceWorker.register(serviceWorkerPath, { scope }).catch((error) => {
          console.warn("Service worker registration failed", error);
        });
      });
    });
  }
}
