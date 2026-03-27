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

export async function fetchJson(path) {
  const response = await fetch(path, {
    headers: { Accept: "application/json" },
    cache: "force-cache",
  });
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }
  return response.json();
}

export function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

export function articlePath(slug) {
  return `posts/${slug}/`;
}

export function categoryPath(name) {
  return `categories/${slugify(name)}/`;
}

export function tagPath(name) {
  return `tags/${slugify(name)}/`;
}

export function getSiteBaseUrl() {
  const configured = (PETZONE_CONFIG.siteUrl || "").replace(/\/$/, "");
  if (configured && !configured.includes("your-username.github.io")) {
    return configured;
  }

  const segments = window.location.pathname.split("/").filter(Boolean);
  const repoSegment = segments[0] && !segments[0].includes(".") && !["posts", "categories", "tags"].includes(segments[0])
    ? `/${segments[0]}`
    : "";
  return `${window.location.origin}${repoSegment}`;
}

export function canonicalUrl(pathname = "") {
  const base = getSiteBaseUrl();
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${base}${path}`;
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
