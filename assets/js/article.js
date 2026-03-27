import { getAllArticles, getArticleBySlug, getRelatedArticles } from "./contentService.js";
import { buildInlineArticleFigure, resolveArticleFeaturedImage } from "./articleMedia.js";
import { registerServiceWorker } from "./pwa.js";
import { replaceJsonLd, setPageMeta } from "./seo.js";
import {
  injectSiteChrome,
  populateBreakingTicker,
  renderBreadcrumbs,
  renderRelatedArticles,
  renderSidebarItem,
  renderTagPills,
  showToast,
  wireShareButton,
} from "./ui.js";
import { articlePath, byId, canonicalUrl, describeLoadError, escapeHtml, formatDate, getQueryParam, scheduleIdleWork, showFallbackUI, sitePath, slugify, stripHtml } from "./utils.js";

function buildHeadingAnchors(headings = []) {
  const used = new Map();
  return headings.map((heading) => {
    const base = slugify(stripHtml(heading)) || "section";
    const count = (used.get(base) || 0) + 1;
    used.set(base, count);
    return {
      heading,
      id: count === 1 ? base : `${base}-${count}`,
    };
  });
}

function normalizeSchemaImage(imageSrc = "") {
  if (/^(https?:|data:)/i.test(imageSrc)) {
    return imageSrc;
  }
  return canonicalUrl(`/${imageSrc}`);
}

function renderFaqSection(faqItems = []) {
  return `
    <section class="sidebar-box">
      <h2 class="section-title">FAQs</h2>
      <div class="faq-list">
        ${faqItems
          .map(
            (item) => `
              <article class="faq-item">
                <h3>${escapeHtml(item.question)}</h3>
                <p>${escapeHtml(item.answer)}</p>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderInternalLinksSection(links = []) {
  if (!links.length) {
    return "";
  }
  return `
    <section class="sidebar-box">
      <h2 class="section-title">Read next in this topic cluster</h2>
      <div class="headline-stack">
        ${links
          .map(
            (item, index) => `
              <article class="headline-row">
                <span class="headline-rank">${String(index + 1).padStart(2, "0")}</span>
                <div class="headline-row-body">
                  <a href="${articlePath(item.slug)}" class="headline-row-link">${escapeHtml(item.anchor || item.slug)}</a>
                  <div class="meta-copy">${escapeHtml(item.reason || "Related PetZone coverage.")}</div>
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function detectSlugFromPath() {
  const match = window.location.pathname.match(/\/posts\/([^/]+)\/?$/i);
  return match?.[1] || "";
}

async function initArticlePage() {
  injectSiteChrome();
  registerServiceWorker();

  const slug = getQueryParam("slug") || detectSlugFromPath();
  if (!slug) {
    byId("article-main").innerHTML = `<div class="empty-state"><h1 class="section-title">Article not found</h1><p class="muted-copy">Choose a story from the homepage or search to continue.</p></div>`;
    return;
  }

  console.log("Fetching article:", slug);
  const article = await getArticleBySlug(slug);
  if (!article?.content) {
    byId("article-main").innerHTML = `<div class="empty-state"><h1 class="section-title">Article not found</h1><p class="muted-copy">This article is not available in the current static data set.</p></div>`;
    return;
  }

  let allArticles = [];
  try {
    allArticles = await getAllArticles();
  } catch (relatedError) {
    console.warn("Related articles could not be loaded.", relatedError);
  }
  console.log("Loaded data:", { article, allArticles });
  const relatedArticles = getRelatedArticles(allArticles, article);
  if (allArticles.length) {
    populateBreakingTicker(allArticles);
  }

  const headingAnchors = buildHeadingAnchors(article.headings || []);
  let headingIndex = 0;
  let visualIndex = 0;
  const articleContent = (article.content || "").replace(/<h([23])>(.*?)<\/h\1>/g, (_, level, headingText) => {
    const clean = stripHtml(headingText);
    const anchor = headingAnchors[headingIndex];
    headingIndex += 1;
    const headingMarkup = `<h${level} id="${anchor?.id || slugify(clean)}">${escapeHtml(clean)}</h${level}>`;
    if (
      level === "2"
      && visualIndex < 3
      && !/internal links that strengthen this topic cluster|frequently asked questions/i.test(clean)
    ) {
      const figure = buildInlineArticleFigure(article, clean, visualIndex);
      visualIndex += 1;
      return `${headingMarkup}${figure}`;
    }
    return headingMarkup;
  });
  const featuredImageSrc = resolveArticleFeaturedImage(article);

  setPageMeta({
    title: article.seoTitle || `${article.title} | PetZone`,
    description: article.seoDescription || article.excerpt,
    canonical: `/posts/${article.slug}/`,
    ogImage: featuredImageSrc,
    keywords: article.seoKeywords || article.tags || [],
  });

  replaceJsonLd("article-jsonld", {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.title,
    description: article.seoDescription,
    datePublished: article.publishDate,
    dateModified: article.updatedDate,
    author: {
      "@type": "Person",
      name: article.author.name,
    },
    publisher: {
      "@type": "Organization",
      name: "PetZone",
    },
    image: normalizeSchemaImage(featuredImageSrc),
    mainEntityOfPage: canonicalUrl(`/posts/${article.slug}/`),
  });

  replaceJsonLd("breadcrumb-jsonld", {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: canonicalUrl("/") },
      { "@type": "ListItem", position: 2, name: article.categoryLabel, item: canonicalUrl(`/categories/${article.category}/`) },
      { "@type": "ListItem", position: 3, name: article.title, item: canonicalUrl(`/posts/${article.slug}/`) },
    ],
  });

  replaceJsonLd("faq-jsonld", {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: (article.faqItems || []).map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  });

  byId("article-main").classList.remove("article-loading");
  byId("article-main").innerHTML = `
    ${renderBreadcrumbs([
      { label: "Home", href: sitePath("index.html") },
      { label: article.categoryLabel, href: sitePath(`categories/${article.category}/`) },
      { label: article.title },
    ])}
    <div class="card-meta-row">
      <span class="category-pill ${article.category}">${escapeHtml(article.categoryLabel)}</span>
      <span>${formatDate(article.publishDate)}</span>
      <span>Updated ${formatDate(article.updatedDate)}</span>
      <span>${article.readingTime} min read</span>
    </div>
    <h1 class="article-title">${escapeHtml(article.title)}</h1>
    <p class="article-standfirst">${escapeHtml(article.excerpt)}</p>
    <img
      class="article-featured-image"
      src="${featuredImageSrc}"
      alt="${escapeHtml(article.imageAlt || article.title)}"
      loading="eager"
      decoding="async"
      fetchpriority="high"
      width="1200"
      height="675"
      sizes="(max-width: 767px) 100vw, (max-width: 1100px) 92vw, 860px"
    />
    <div class="article-toolbar">
      <button id="share-link-button" class="button button-secondary" type="button">Share</button>
      <a class="button button-secondary" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(article.title)}&url=${encodeURIComponent(canonicalUrl(`/posts/${article.slug}/`))}" target="_blank" rel="noreferrer">Share on X</a>
    </div>
    <section class="sidebar-box">
      <h2 class="section-title small-title">Table of contents</h2>
      <ol class="toc-list">${headingAnchors.map((item) => `<li><a href="#${item.id}">${escapeHtml(item.heading)}</a></li>`).join("")}</ol>
    </section>
    <div class="article-content">${articleContent}</div>
    <section class="author-box sidebar-box">
      <h2 class="section-title small-title">About the author</h2>
      <p><strong>${escapeHtml(article.author.name)}</strong> - ${escapeHtml(article.author.role || "")}</p>
      <p class="muted-copy">${escapeHtml(article.author.bio || "")}</p>
    </section>
    ${renderInternalLinksSection(article.internalLinkSuggestions)}
    <div id="article-related-slot" class="content-deferred"></div>
  `;

  wireShareButton(byId("share-link-button"), {
    url: canonicalUrl(`/posts/${article.slug}/`),
    title: article.title,
    text: article.excerpt,
  });

  scheduleIdleWork(() => {
    byId("article-sidebar").innerHTML = `
      <section class="sidebar-box">
        <div class="section-header compact-header"><h2 class="section-title">Trending</h2></div>
        ${allArticles.slice(0, 6).map(renderSidebarItem).join("")}
      </section>
      <section class="sidebar-box">
        <div class="section-header compact-header"><h2 class="section-title">Tags</h2></div>
        <div class="tag-row">${renderTagPills(article.tags)}</div>
      </section>
      ${renderFaqSection(article.faqItems)}
    `;

    byId("article-related-slot").innerHTML = renderRelatedArticles(relatedArticles);
  });
}

initArticlePage().catch((error) => {
  console.error("Article failed to load:", error);
  showFallbackUI("article-main", {
    title: "Article failed to load",
    description: describeLoadError(error, "article content"),
  });
  showToast("Article failed to load.");
});
