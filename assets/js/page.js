import { registerServiceWorker } from "./pwa.js";
import { setPageMeta } from "./seo.js";
import { injectSiteChrome } from "./ui.js";

function getCurrentCanonicalPath() {
  const segments = window.location.pathname.split("/").filter(Boolean);
  if (!segments.length) {
    return "/index.html";
  }
  const first = segments[0] || "";
  const offset = first.includes(".") ? 0 : 1;
  const path = segments.slice(offset).join("/");
  return `/${path || "index.html"}`;
}

injectSiteChrome();
setPageMeta({
  title: document.title,
  description: document.querySelector('meta[name="description"]')?.getAttribute("content") || "",
  canonical: getCurrentCanonicalPath(),
  ogImage: "assets/images/og-default.svg",
});
registerServiceWorker();
