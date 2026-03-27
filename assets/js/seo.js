import { canonicalUrl } from "./utils.js";

function absoluteSiteUrl(value = "") {
  if (/^(https?:|data:)/i.test(value)) {
    return value;
  }
  return canonicalUrl(value.startsWith("/") ? value : `/${value}`);
}

function upsertMeta(selector, attrs) {
  let node = document.head.querySelector(selector);
  if (!node) {
    node = document.createElement("meta");
    Object.entries(attrs)
      .filter(([key]) => key !== "content")
      .forEach(([key, value]) => node.setAttribute(key, value));
    document.head.append(node);
  }
  if (attrs.content) {
    node.setAttribute("content", attrs.content);
  }
  return node;
}

function upsertLink(selector, attrs) {
  let node = document.head.querySelector(selector);
  if (!node) {
    node = document.createElement("link");
    document.head.append(node);
  }

  Object.entries(attrs).forEach(([key, value]) => {
    node.setAttribute(key, value);
  });

  return node;
}

export function setPageMeta({
  title,
  description,
  canonical,
  ogImage,
  keywords = [],
  ogType = "website",
  twitterCard = "summary_large_image",
}) {
  if (title) {
    document.title = title;
    upsertMeta('meta[property="og:title"]', { property: "og:title", content: title });
    upsertMeta('meta[name="twitter:title"]', { name: "twitter:title", content: title });
  }
  if (description) {
    upsertMeta('meta[name="description"]', { name: "description", content: description });
    upsertMeta('meta[property="og:description"]', { property: "og:description", content: description });
    upsertMeta('meta[name="twitter:description"]', { name: "twitter:description", content: description });
  }
  upsertMeta('meta[property="og:type"]', { property: "og:type", content: ogType });
  upsertMeta('meta[name="twitter:card"]', { name: "twitter:card", content: twitterCard });
  if (ogImage) {
    upsertMeta('meta[property="og:image"]', { property: "og:image", content: absoluteSiteUrl(ogImage) });
    upsertMeta('meta[name="twitter:image"]', { name: "twitter:image", content: absoluteSiteUrl(ogImage) });
  }
  if (keywords.length) {
    upsertMeta('meta[name="keywords"]', { name: "keywords", content: keywords.join(", ") });
  }
  if (canonical) {
    const href = canonicalUrl(canonical);
    let link = document.head.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      document.head.append(link);
    }
    link.setAttribute("href", href);
    upsertLink('link[rel="alternate"][hreflang="en"]', { rel: "alternate", hreflang: "en", href });
    upsertLink('link[rel="alternate"][hreflang="x-default"]', { rel: "alternate", hreflang: "x-default", href });
    upsertMeta('meta[property="og:url"]', { property: "og:url", content: href });
  }
}

export function replaceJsonLd(id, payload) {
  let script = document.getElementById(id);
  if (!script) {
    script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = id;
    document.head.append(script);
  }
  script.textContent = JSON.stringify(payload);
}
