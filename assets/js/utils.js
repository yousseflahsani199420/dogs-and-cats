import { PETZONE_CONFIG } from "./config.js";

export function byId(id) {
  return document.getElementById(id);
}

export function slugify(value = "") {
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

export function stripHtml(html = "") {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function escapeHtml(value = "") {
  return value
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatDate(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function getCurrentDateLabel() {
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());
}

export function estimateReadingTimeFromHtml(html = "") {
  const words = stripHtml(html).split(/\s+/).filter(Boolean).length;
  return Math.max(3, Math.ceil(words / 210));
}

function inferRuntimeBasePath() {
  const segments = window.location.pathname.split("/").filter(Boolean);
  const reservedSegments = new Set([
    "posts",
    "categories",
    "tags",
    "admin",
    "article",
    "category",
    "search",
    "about",
    "contact",
    "privacy",
    "terms",
    "faq",
    "index",
  ]);
  const first = segments[0] || "";
  if (!first || first.includes(".") || reservedSegments.has(first)) {
    return "";
  }
  return `/${first}`;
}

export function getRuntimeBaseUrl() {
  return `${window.location.origin}${inferRuntimeBasePath()}`;
}

export function sitePath(pathname = "") {
  const cleanPath = pathname.toString().replace(/^\.?\//, "");
  const resolved = new URL(cleanPath || "", `${getRuntimeBaseUrl().replace(/\/$/, "")}/`);
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}

export function assetPath(pathname = "") {
  if (/^(https?:|data:|blob:)/i.test(pathname)) {
    return pathname;
  }
  return sitePath(pathname);
}

export function resolveSiteUrl(pathname = "") {
  if (/^(https?:|data:|blob:)/i.test(pathname)) {
    return pathname;
  }
  return new URL(pathname.toString().replace(/^\.?\//, ""), `${getRuntimeBaseUrl().replace(/\/$/, "")}/`).toString();
}

async function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function describeFetchFailure(path, error) {
  const message = error?.message || "";
  if (/timed out/i.test(message)) {
    return `The request for ${path} took too long. Please check your connection and try again.`;
  }
  if (/404/.test(message)) {
    return `PetZone could not find ${path}. If this was just deployed, refresh once and try again.`;
  }
  return `PetZone could not load ${path}. Please try again in a moment.`;
}

export function describeLoadError(error, context = "content") {
  const message = error?.message || "";
  if (/timed out/i.test(message)) {
    return `The ${context} request took too long. Please check your connection and retry.`;
  }
  if (/404/.test(message)) {
    return `The latest ${context} files are not available yet. Refresh once after deployment and try again.`;
  }
  return `We could not load the latest ${context} right now. Please retry in a moment.`;
}

export async function fetchJson(path, {
  retries = PETZONE_CONFIG.fetchRetryAttempts || 3,
  retryDelayMs = PETZONE_CONFIG.fetchRetryDelayMs || 600,
  timeoutMs = PETZONE_CONFIG.fetchTimeoutMs || 9000,
} = {}) {
  const requestUrl = resolveSiteUrl(path);
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutHandle = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      console.log(`Fetching articles/data: ${requestUrl} (attempt ${attempt}/${retries})`);
      const response = await fetch(requestUrl, {
        headers: { Accept: "application/json" },
        cache: "no-cache",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to load ${path}: ${response.status}`);
      }

      const data = await response.json();
      console.log("Loaded data:", data);
      return data;
    } catch (error) {
      lastError = error?.name === "AbortError"
        ? new Error(`Request timed out for ${path}`)
        : error;
      console.warn(describeFetchFailure(path, lastError));
      if (attempt < retries) {
        await delay(retryDelayMs * attempt);
      }
    } finally {
      window.clearTimeout(timeoutHandle);
    }
  }

  console.error("Fetch error:", lastError);
  throw lastError;
}

export function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

export function articlePath(slug) {
  return sitePath(`posts/${slug}/`);
}

export function categoryPath(name) {
  return sitePath(`categories/${slugify(name)}/`);
}

export function tagPath(name) {
  return sitePath(`tags/${slugify(name)}/`);
}

export function getSiteBaseUrl() {
  const configured = (PETZONE_CONFIG.siteUrl || "").replace(/\/$/, "");
  if (configured && !configured.includes("your-username.github.io")) {
    return configured;
  }

  const segments = window.location.pathname.split("/").filter(Boolean);
  const reservedSegments = new Set([
    "posts",
    "categories",
    "tags",
    "admin",
    "article",
    "category",
    "search",
    "about",
    "contact",
    "privacy",
    "terms",
    "faq",
    "index",
  ]);
  const repoSegment = segments[0] && !segments[0].includes(".") && !reservedSegments.has(segments[0])
    ? `/${segments[0]}`
    : "";
  return `${window.location.origin}${repoSegment}`;
}

export function canonicalUrl(pathname = "") {
  const base = getSiteBaseUrl();
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${base}${path}`;
}

export function showFallbackUI(targets, {
  title = "Content failed to load",
  description = "Refresh the page or try again in a moment.",
  retryLabel = "Retry",
  retryAction = () => window.location.reload(),
} = {}) {
  const elements = Array.isArray(targets) ? targets : [targets];
  elements.forEach((target, index) => {
    const element = typeof target === "string" ? byId(target) : target;
    if (!element) {
      return;
    }
    element.classList.remove("news-loading", "article-loading");
    element.classList.remove("hidden");
    const showRetryButton = index === 0;
    element.innerHTML = `
      <div class="empty-state load-failure-state${index > 0 ? " compact-failure-state" : ""}" role="status">
        ${index === 0 ? `<h2 class="section-title">${escapeHtml(title)}</h2>` : ""}
        <p class="muted-copy">${escapeHtml(description)}</p>
        ${
          showRetryButton
            ? `<button type="button" class="button button-secondary fallback-retry-button" data-fallback-retry>${escapeHtml(retryLabel)}</button>`
            : ""
        }
      </div>
    `;
    const retryButton = element.querySelector("[data-fallback-retry]");
    if (retryButton) {
      retryButton.addEventListener("click", () => retryAction());
    }
  });
}

export function uniqueBy(items, selector) {
  const seen = new Set();
  return items.filter((item) => {
    const key = selector(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function compareByDateDesc(left, right) {
  return new Date(right.publishDate).getTime() - new Date(left.publishDate).getTime();
}

export function pickTop(items, count) {
  return items.slice(0, count);
}

export function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function scheduleIdleWork(callback, { timeout = 1500 } = {}) {
  if ("requestIdleCallback" in window) {
    return window.requestIdleCallback(callback, { timeout });
  }
  return window.setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 0 }), 1);
}

export function cancelIdleWork(handle) {
  if ("cancelIdleCallback" in window) {
    window.cancelIdleCallback(handle);
    return;
  }
  window.clearTimeout(handle);
}

export function copyToClipboard(value) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(value);
  }
  const input = document.createElement("textarea");
  input.value = value;
  document.body.append(input);
  input.select();
  document.execCommand("copy");
  input.remove();
  return Promise.resolve();
}

export async function shareContent({ title = "", text = "", url = "" } = {}) {
  const shareUrl = url || window.location.href;
  if (navigator.share) {
    try {
      const payload = Object.fromEntries(
        Object.entries({ title, text, url: shareUrl }).filter(([, value]) => Boolean(value))
      );
      await navigator.share(payload);
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") {
        return "cancelled";
      }
    }
  }

  await copyToClipboard(shareUrl);
  return "copied";
}
