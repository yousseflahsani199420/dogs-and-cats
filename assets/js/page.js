import { registerServiceWorker } from "./pwa.js";
import { replaceJsonLd, setPageMeta } from "./seo.js";
import { PETZONE_CONFIG } from "./config.js";
import { canonicalUrl } from "./utils.js";
import { injectSiteChrome } from "./ui.js";

function getCurrentCanonicalPath() {
  const segments = window.location.pathname.split("/").filter(Boolean);
  if (!segments.length) {
    return "/";
  }
  const first = segments[0] || "";
  const offset = first.includes(".") ? 0 : 1;
  const path = segments.slice(offset).join("/");
  return `/${path || ""}` || "/";
}

function buildOrganizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: PETZONE_CONFIG.siteName,
    url: PETZONE_CONFIG.siteUrl,
    logo: {
      "@type": "ImageObject",
      url: canonicalUrl("/assets/images/logo-mark.svg"),
      width: 512,
      height: 512,
    },
  };
}

function buildWebsiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: PETZONE_CONFIG.siteName,
    url: PETZONE_CONFIG.siteUrl,
    potentialAction: {
      "@type": "SearchAction",
      target: `${PETZONE_CONFIG.siteUrl}/search.html?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

function buildBreadcrumbSchema(pathname, label) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: canonicalUrl("/") },
      { "@type": "ListItem", position: 2, name: label, item: canonicalUrl(pathname) },
    ],
  };
}

function buildFaqSchema() {
  const items = Array.from(document.querySelectorAll(".faq-item")).map((item) => ({
    question: item.querySelector("summary")?.textContent?.trim(),
    answer: item.querySelector("p")?.textContent?.trim(),
  })).filter((item) => item.question && item.answer);

  if (!items.length) {
    return null;
  }

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

function applyPageSchemas() {
  const page = document.body.dataset.page || "page";
  const title = document.title;
  const description = document.querySelector('meta[name="description"]')?.getAttribute("content") || "";
  const pathname = getCurrentCanonicalPath();
  const heading = document.querySelector("h1")?.textContent?.trim() || title;
  const pageTypeMap = {
    about: "AboutPage",
    contact: "ContactPage",
    privacy: "WebPage",
    terms: "WebPage",
    faq: "FAQPage",
  };

  replaceJsonLd("organization-jsonld", buildOrganizationSchema());
  replaceJsonLd("website-jsonld", buildWebsiteSchema());

  if (page !== "home") {
    replaceJsonLd("breadcrumb-jsonld", buildBreadcrumbSchema(pathname, heading));
  }

  if (page === "faq") {
    const faqSchema = buildFaqSchema();
    if (faqSchema) {
      replaceJsonLd("page-jsonld", faqSchema);
      return;
    }
  }

  replaceJsonLd("page-jsonld", {
    "@context": "https://schema.org",
    "@type": pageTypeMap[page] || "WebPage",
    name: heading,
    headline: heading,
    description,
    url: canonicalUrl(pathname),
    isPartOf: {
      "@type": "WebSite",
      name: PETZONE_CONFIG.siteName,
      url: PETZONE_CONFIG.siteUrl,
    },
  });
}

injectSiteChrome();
setPageMeta({
  title: document.title,
  description: document.querySelector('meta[name="description"]')?.getAttribute("content") || "",
  canonical: getCurrentCanonicalPath(),
  ogImage: "assets/images/og-default.svg",
});
applyPageSchemas();
registerServiceWorker();
