const fs = require("fs");
const path = require("path");
const {
  ARTICLES_FILE,
  ASSET_VERSION,
  CATEGORY_INDEX_FILE,
  CATEGORIES_DIR,
  CATEGORY_LABELS,
  DATA_DIR,
  DEFAULT_OG_IMAGE,
  GA_MEASUREMENT_ID,
  KEYWORD_CLUSTERS_FILE,
  KEYWORDS_FILE,
  POSTS_DIR,
  ROOT_DIR,
  SEARCH_INDEX_FILE,
  SITE_FEEDS_FILE,
  SITE_BASE_URL,
  SITE_DESCRIPTION,
  SITE_NAME,
  TAGS_DIR,
  VIRAL_TITLES_FILE,
} = require("./lib/constants");
const {
  articleUrl,
  categoryUrl,
  collectHeadings,
  ensureBaseDirs,
  ensureDir,
  loadArticles,
  loadPublishingHistory,
  loadTopicQueue,
  normalizeArticle,
  saveArticle,
  savePublishingHistory,
  saveTopicQueue,
  slugify,
  stripHtml,
  writeJson,
  writeText,
} = require("./lib/content-utils");
const {
  buildTopicQueue,
  getInitialSeedTopics,
  getKeywordClusters,
  getKeywordData,
  getKeywordRecords,
  getViralTitles,
} = require("./lib/seed-data");
const {
  buildCategoryDigest,
  buildSearchEntry,
  buildSeoDescription,
  buildSeoKeywords,
  buildSeoTitle,
  buildSiteFeeds,
  summarizeArticle,
} = require("./lib/publishing-data");
const { buildInlineArticleFigure, resolveArticleFeaturedImage } = require("./lib/article-media");
const { buildSeedArticle } = require("./generate-article");
const { divider, info, warn } = require("./lib/logger");

const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 675;
const COLLECTION_GRID_LIMIT = 36;
const DEFAULT_ROBOTS = "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";
const PRIMARY_LANGUAGE = "en";
const NEWS_SITEMAP_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 2;
const NEWS_SITEMAP_LIMIT = 1000;

function escapeHtml(value = "") {
  return value
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeXml(value = "") {
  return escapeHtml(value);
}

function buildTagPills(tags = [], prefix = "../") {
  return tags
    .map((tag) => `<a href="${prefix}tags/${slugify(tag)}/" class="tag-pill">${escapeHtml(tag)}</a>`)
    .join("");
}

function renderStaticBadges(article) {
  const badges = [];
  if (article.featured) {
    badges.push('<span class="meta-badge featured">Featured</span>');
  }
  if (article.trending) {
    badges.push('<span class="meta-badge trending">Trending</span>');
  }
  return badges.join("");
}

function renderAnalyticsSnippet() {
  if (!GA_MEASUREMENT_ID) {
    return "";
  }

  return `
    <script async src="https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${GA_MEASUREMENT_ID}');
    </script>
  `;
}

function countWords(value = "") {
  return stripHtml(value).split(/\s+/).filter(Boolean).length;
}

function buildOrganizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_BASE_URL,
    logo: {
      "@type": "ImageObject",
      url: `${SITE_BASE_URL}/assets/images/logo-mark.svg`,
      width: 512,
      height: 512,
    },
    sameAs: [SITE_BASE_URL],
  };
}

function buildWebsiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_BASE_URL,
    description: SITE_DESCRIPTION,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_BASE_URL}/search.html?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

function buildBreadcrumbSchema(items = []) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.item,
    })),
  };
}

function buildCollectionSchema({ title, description, canonicalPath, articles = [] }) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    description,
    url: `${SITE_BASE_URL}${canonicalPath}`,
    isPartOf: {
      "@type": "WebSite",
      name: SITE_NAME,
      url: SITE_BASE_URL,
    },
    mainEntity: {
      "@type": "ItemList",
      itemListElement: articles.slice(0, 12).map((article, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: article.canonicalUrl || articleUrl(article.slug),
        name: article.title,
      })),
    },
  };
}

function renderAlternateLinks(canonical) {
  return `
    <link rel="alternate" hreflang="${PRIMARY_LANGUAGE}" href="${canonical}" />
    <link rel="alternate" hreflang="x-default" href="${canonical}" />
  `;
}

function renderSharedHead({
  title,
  description,
  canonicalPath,
  prefix = "",
  keywords = [],
  ogType = "website",
  image = "",
  imageAlt = `${SITE_NAME} preview image`,
  robots = DEFAULT_ROBOTS,
  extraHead = "",
}) {
  const canonical = `${SITE_BASE_URL}${canonicalPath}`;
  const shareImage = image ? normalizeStaticSchemaImage(image) : `${SITE_BASE_URL}/${DEFAULT_OG_IMAGE}`;
  return `
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="keywords" content="${escapeHtml((keywords || []).join(", "))}" />
    <meta name="author" content="${SITE_NAME} Editorial Team" />
    <meta name="robots" content="${robots}" />
    <meta name="referrer" content="strict-origin-when-cross-origin" />
    <meta name="theme-color" content="#ffffff" />
    <meta name="color-scheme" content="light" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:type" content="${ogType}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:image" content="${shareImage}" />
    <meta property="og:image:width" content="${IMAGE_WIDTH}" />
    <meta property="og:image:height" content="${IMAGE_HEIGHT}" />
    <meta property="og:image:alt" content="${escapeHtml(imageAlt)}" />
    <meta property="og:url" content="${canonical}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${shareImage}" />
    <meta name="twitter:image:alt" content="${escapeHtml(imageAlt)}" />
    <link rel="canonical" href="${canonical}" />
    ${renderAlternateLinks(canonical)}
    <link rel="icon" href="${prefix}assets/images/favicon.svg" type="image/svg+xml" />
    <link rel="manifest" href="${prefix}manifest.json" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Merriweather:wght@700;900&family=Source+Sans+3:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
    ${renderAnalyticsSnippet()}
    <link rel="stylesheet" href="${prefix}assets/css/styles.css?v=${ASSET_VERSION}" />
    ${extraHead}
  `;
}

function renderStaticHeader(prefix = "../") {
  return `
    <a class="skip-link" href="#page-content">Skip to content</a>
    <section class="news-topline">
      <div class="site-shell news-topline-inner">
        <span>PetZone newsroom</span>
        <span>Fresh cat and dog coverage, updated daily</span>
      </div>
    </section>
    <header class="main-header">
      <div class="site-shell main-header-inner">
        <a href="${prefix}index.html" class="brand-logo" aria-label="PetZone home">
          <img src="${prefix}assets/images/logo-full.svg" alt="PetZone" class="brand-logo-image" width="190" height="60" />
        </a>
        <nav class="nav-links" aria-label="Primary navigation">
          <a href="${prefix}index.html" class="nav-link">Home</a>
          <a href="${prefix}categories/cats/" class="nav-link">Cats</a>
          <a href="${prefix}categories/dogs/" class="nav-link">Dogs</a>
          <a href="${prefix}search.html" class="nav-link">Search</a>
          <a href="${prefix}about.html" class="nav-link">About</a>
          <a href="${prefix}contact.html" class="nav-link">Contact</a>
        </nav>
        <div class="header-actions">
          <button
            type="button"
            class="mobile-nav-toggle"
            data-static-nav-toggle
            aria-expanded="false"
            aria-controls="static-mobile-menu"
            aria-label="Toggle navigation"
          >
            <span class="hamburger-lines" aria-hidden="true"><span></span><span></span><span></span></span>
            <span class="mobile-nav-label">Menu</span>
          </button>
        </div>
      </div>
      <div class="mobile-menu-overlay" data-static-mobile-overlay hidden></div>
      <div id="static-mobile-menu" class="mobile-menu" data-static-mobile-menu hidden>
        <div class="site-shell mobile-menu-inner">
          <a href="${prefix}index.html" class="mobile-link">Home</a>
          <a href="${prefix}categories/cats/" class="mobile-link">Cats</a>
          <a href="${prefix}categories/dogs/" class="mobile-link">Dogs</a>
          <a href="${prefix}search.html" class="mobile-link">Search</a>
          <a href="${prefix}about.html" class="mobile-link">About</a>
          <a href="${prefix}contact.html" class="mobile-link">Contact</a>
        </div>
      </div>
    </header>
  `;
}

function renderStaticFooter(prefix = "../") {
  return `
    <footer class="site-footer">
      <div class="site-shell footer-main">
        <div>
          <p class="eyebrow">PetZone</p>
          <h2 class="section-title small-title">Built for SEO, speed, and daily publishing.</h2>
          <p class="muted-copy">${escapeHtml(SITE_DESCRIPTION)}</p>
        </div>
        <div class="footer-link-grid">
          <a href="${prefix}about.html">About</a>
          <a href="${prefix}contact.html">Contact</a>
          <a href="${prefix}privacy.html">Privacy</a>
          <a href="${prefix}terms.html">Terms</a>
          <a href="${prefix}faq.html">FAQ</a>
          <a href="${prefix}admin.html">Admin</a>
        </div>
      </div>
    </footer>
  `;
}

function renderSidebarItems(articles = [], prefix = "../") {
  return articles
    .map((article, index) => {
      const publishDate = new Date(article.publishDate).toLocaleDateString("en", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      return `
        <article class="sidebar-item">
          <span class="sidebar-rank">${String(index + 1).padStart(2, "0")}</span>
          <div>
            <a href="${prefix}posts/${article.slug}/" class="sidebar-link">${escapeHtml(article.title)}</a>
            <p class="sidebar-meta">${publishDate} - ${article.readingTime} min</p>
          </div>
        </article>
      `;
    })
    .join("");
}

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

function normalizeStaticSchemaImage(imageSrc = "") {
  if (/^(https?:|data:)/i.test(imageSrc)) {
    return imageSrc;
  }
  return `${SITE_BASE_URL}/${imageSrc.replace(/^(\.\.\/)+/g, "")}`;
}

function getStaticFallbackImage(src = "") {
  const prefixMatch = src.match(/^(\.\.\/)+/);
  const prefix = prefixMatch ? prefixMatch[0] : "";
  return `${prefix}assets/images/placeholder-pet.svg`;
}

function renderStaticResponsiveImage({
  src,
  alt,
  loading = "lazy",
  fetchpriority = "auto",
  sizes = "(max-width: 767px) 100vw, 360px",
}) {
  return `
    <img
      src="${src}"
      alt="${escapeHtml(alt)}"
      loading="${loading}"
      decoding="async"
      width="${IMAGE_WIDTH}"
      height="${IMAGE_HEIGHT}"
      sizes="${sizes}"
      onerror="this.onerror=null;this.src='${getStaticFallbackImage(src)}';"
      ${fetchpriority !== "auto" ? `fetchpriority="${fetchpriority}"` : ""}
    />
  `;
}

function renderArticleCard(article, prefix = "../") {
  const imageSrc = resolveArticleFeaturedImage(article, prefix);
  return `
    <article class="grid-card news-card">
      <a href="${prefix}posts/${article.slug}/" class="media-link news-media">
        ${renderStaticResponsiveImage({
          src: imageSrc,
          alt: article.imageAlt || article.title,
          sizes: "(max-width: 767px) 100vw, (max-width: 1100px) 46vw, 360px",
        })}
      </a>
      <div class="news-card-body">
        <div class="card-meta-row">
          <a class="category-pill ${article.category}" href="${prefix}categories/${article.category}/">${escapeHtml(article.categoryLabel)}</a>
          <span>${new Date(article.publishDate).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}</span>
          <span>${article.readingTime} min</span>
          ${renderStaticBadges(article)}
        </div>
        <a href="${prefix}posts/${article.slug}/" class="headline-link medium-headline">${escapeHtml(article.title)}</a>
        <p class="card-excerpt">${escapeHtml(article.excerpt)}</p>
      </div>
    </article>
  `;
}

function renderCollectionPage({ title, description, articles, canonicalPath }) {
  const prefix = "../../";
  const lead = articles[0];
  const headlineItems = articles.slice(1, 6);
  const gridItems = articles.slice(1, COLLECTION_GRID_LIMIT + 1);
  const topTags = Array.from(new Set(articles.flatMap((article) => article.tags || []))).slice(0, 8);
  const leadImage = lead ? resolveArticleFeaturedImage(lead, prefix) : "";
  const breadcrumbItems = canonicalPath.startsWith("/categories/")
    ? [
        { name: "Home", item: `${SITE_BASE_URL}/` },
        { name: title, item: `${SITE_BASE_URL}${canonicalPath}` },
      ]
    : [
        { name: "Home", item: `${SITE_BASE_URL}/` },
        { name: title, item: `${SITE_BASE_URL}${canonicalPath}` },
      ];
  const collectionSchema = buildCollectionSchema({ title, description, canonicalPath, articles });
  const breadcrumbSchema = buildBreadcrumbSchema(breadcrumbItems);
  return `<!DOCTYPE html>
  <html lang="en">
    <head>${renderSharedHead({
      title,
      description,
      canonicalPath,
      prefix,
      keywords: topTags,
      image: leadImage,
      imageAlt: lead?.imageAlt || title,
      extraHead: leadImage
        ? `<link rel="preload" as="image" href="${leadImage}" imagesizes="(max-width: 767px) 100vw, (max-width: 1100px) 92vw, 720px" />`
        : "",
    })}
      <script type="application/ld+json">${JSON.stringify(buildOrganizationSchema())}</script>
      <script type="application/ld+json">${JSON.stringify(buildWebsiteSchema())}</script>
      <script type="application/ld+json">${JSON.stringify(collectionSchema)}</script>
      <script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>
    </head>
    <body>
      ${renderStaticHeader(prefix)}
      <main id="page-content" class="page-shell">
        <div class="site-shell section-tight">
          <section class="search-page-header">
            <div>
              <p class="eyebrow">Collection</p>
              <h1 class="page-title">${escapeHtml(title)}</h1>
              <p class="muted-copy">${escapeHtml(description)}</p>
              <div class="category-summary-row">
                <span class="category-summary-pill">${articles.length} articles</span>
                <span class="category-summary-pill">${topTags.length} active topics</span>
                <span class="category-summary-pill">Showing latest ${Math.min(gridItems.length + (lead ? 1 : 0), articles.length)} of ${articles.length}</span>
              </div>
              <div class="topic-chip-row">${buildTagPills(topTags, prefix)}</div>
            </div>
          </section>
          <section class="category-lead-grid">
            ${lead ? renderArticleCard(lead, prefix) : ""}
            <section class="headline-panel">
              <div class="section-header compact-header">
                <h2 class="section-title">Fast read</h2>
              </div>
              <div class="headline-stack">
                ${headlineItems
                  .map(
                    (article, index) => `
                      <article class="headline-row">
                        <span class="headline-rank">${String(index + 1).padStart(2, "0")}</span>
                        <div class="headline-row-body">
                          <a href="${prefix}posts/${article.slug}/" class="headline-row-link">${escapeHtml(article.title)}</a>
                          <div class="card-meta-row compact-meta-row">
                            <a class="category-pill ${article.category}" href="${prefix}categories/${article.category}/">${escapeHtml(article.categoryLabel)}</a>
                            <span>${new Date(article.publishDate).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}</span>
                            <span>${article.readingTime} min</span>
                          </div>
                        </div>
                      </article>
                    `
                  )
                  .join("")}
              </div>
            </section>
          </section>
          <section class="section-tight">
            <div class="news-grid tight-grid">${gridItems.map((article) => renderArticleCard(article, prefix)).join("")}</div>
          </section>
        </div>
      </main>
      ${renderStaticFooter(prefix)}
      <script type="module" src="${prefix}assets/js/staticPage.js?v=${ASSET_VERSION}"></script>
    </body>
  </html>`;
}

function buildRelatedPosts(allArticles, article) {
  return allArticles
    .filter((candidate) => candidate.slug !== article.slug)
    .map((candidate) => {
      const sharedTags = candidate.tags.filter((tag) => article.tags.includes(tag)).length;
      const sharedHeadings = (candidate.headings || []).filter((heading) => article.headings?.includes(heading)).length;
      const clusterScore = candidate.cluster && article.cluster && candidate.cluster === article.cluster ? 6 : 0;
      const intentScore = candidate.intent && article.intent && candidate.intent === article.intent ? 2 : 0;
      const keywordOverlap = candidate.keyword
        ?.split(/\W+/)
        .filter((token) => token.length > 3 && (article.keyword || "").toLowerCase().includes(token.toLowerCase())).length || 0;
      const recencyScore = Math.max(
        0,
        4 - Math.floor(Math.abs(new Date(candidate.publishDate).getTime() - new Date(article.publishDate).getTime()) / 86400000 / 30)
      );
      return {
        candidate,
        score:
          sharedTags * 2 +
          sharedHeadings +
          clusterScore +
          intentScore +
          keywordOverlap * 2 +
          recencyScore +
          (candidate.category === article.category ? 3 : 0),
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        new Date(right.candidate.publishDate).getTime() - new Date(left.candidate.publishDate).getTime()
    )
    .slice(0, 4)
    .map((item) => item.candidate);
}

function resolveInternalLinks(article, allArticles) {
  return (article.internalLinkSuggestions || [])
    .map((suggestion) => {
      if (suggestion.slug === article.slug) {
        return null;
      }
      const target = allArticles.find((candidate) => candidate.slug === suggestion.slug);
      if (!target) {
        return null;
      }
      return {
        slug: target.slug,
        anchor: suggestion.anchor || target.title,
        reason: suggestion.reason || "Relevant archive article.",
      };
    })
    .filter(Boolean)
    .slice(0, 5);
}

function renderArticlePage(article, relatedArticles, sidebarArticles, allArticles) {
  const prefix = "../../";
  const headingAnchors = buildHeadingAnchors(article.headings || []);
  let headingIndex = 0;
  let visualIndex = 0;
  const contentWithAnchors = article.content.replace(/<h([23])>(.*?)<\/h\1>/g, (_, level, text) => {
    const clean = stripHtml(text);
    const anchor = headingAnchors[headingIndex];
    headingIndex += 1;
    const headingMarkup = `<h${level} id="${anchor?.id || slugify(clean)}">${escapeHtml(clean)}</h${level}>`;
    if (
      level === "2"
      && visualIndex < 3
      && !/internal links that strengthen this topic cluster|frequently asked questions/i.test(clean)
    ) {
      const figure = buildInlineArticleFigure(article, clean, visualIndex, prefix);
      visualIndex += 1;
      return `${headingMarkup}${figure}`;
    }
    return headingMarkup;
  });
  const toc = headingAnchors.map((item) => `<li><a href="#${item.id}">${escapeHtml(item.heading)}</a></li>`).join("");
  const resolvedInternalLinks = resolveInternalLinks(article, allArticles);
  const featuredImageSrc = resolveArticleFeaturedImage(article, prefix);
  const internalLinksBlock = resolvedInternalLinks.length
    ? `
      <section class="sidebar-box">
        <h2 class="section-title">Read next in this topic cluster</h2>
        <ul>
          ${resolvedInternalLinks
            .map(
              (item) =>
                `<li><a href="${prefix}posts/${item.slug}/">${escapeHtml(item.anchor)}</a> <span>- ${escapeHtml(item.reason)}</span></li>`
            )
            .join("")}
        </ul>
      </section>
    `
    : "";

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: article.faqItems.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    url: article.canonicalUrl,
    headline: article.title,
    description: article.seoDescription,
    datePublished: article.publishDate,
    dateModified: article.updatedDate,
    inLanguage: "en",
    isAccessibleForFree: true,
    wordCount: countWords(article.content),
    articleSection: article.categoryLabel,
    keywords: (article.seoKeywords || article.tags || []).join(", "),
    author: { "@type": "Person", name: article.author.name },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_BASE_URL}/assets/images/logo-mark.svg`,
      },
    },
    image: normalizeStaticSchemaImage(featuredImageSrc),
    mainEntityOfPage: article.canonicalUrl,
    about: [article.categoryLabel, ...(article.tags || [])].map((name) => ({
      "@type": "Thing",
      name,
    })),
  };
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_BASE_URL}/` },
      { "@type": "ListItem", position: 2, name: article.categoryLabel, item: categoryUrl(article.category) },
      { "@type": "ListItem", position: 3, name: article.title, item: article.canonicalUrl },
    ],
  };

  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      ${renderSharedHead({
        title: article.seoTitle || article.title,
        description: article.seoDescription,
        canonicalPath: `/posts/${article.slug}/`,
        prefix,
        keywords: article.seoKeywords || article.tags || [],
        ogType: "article",
        image: featuredImageSrc,
        imageAlt: article.imageAlt || article.title,
        extraHead: `
          <link rel="preload" as="image" href="${featuredImageSrc}" imagesizes="(max-width: 767px) 100vw, (max-width: 1100px) 92vw, 860px" />
          <meta property="article:published_time" content="${article.publishDate}" />
          <meta property="article:modified_time" content="${article.updatedDate}" />
          <meta property="article:section" content="${escapeHtml(article.categoryLabel)}" />
        `,
      })}
      <script type="application/ld+json">${JSON.stringify(buildOrganizationSchema())}</script>
      <script type="application/ld+json">${JSON.stringify(buildWebsiteSchema())}</script>
      <script type="application/ld+json">${JSON.stringify(articleSchema)}</script>
      <script type="application/ld+json">${JSON.stringify(faqSchema)}</script>
      <script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>
    </head>
    <body>
      ${renderStaticHeader(prefix)}
      <main id="page-content" class="page-shell">
        <div class="site-shell section-tight">
          <div class="article-layout">
            <article class="article-main">
              <nav class="breadcrumbs" aria-label="Breadcrumb">
                <a href="${prefix}index.html">Home</a><span>/</span>
                <a href="${prefix}categories/${article.category}/">${escapeHtml(article.categoryLabel)}</a><span>/</span>
                <span>${escapeHtml(article.title)}</span>
              </nav>
              <div class="card-meta-row">
                <span class="category-pill ${article.category}">${escapeHtml(article.categoryLabel)}</span>
                <span>${new Date(article.publishDate).toLocaleDateString("en", { month: "long", day: "numeric", year: "numeric" })}</span>
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
                width="${IMAGE_WIDTH}"
                height="${IMAGE_HEIGHT}"
                sizes="(max-width: 767px) 100vw, (max-width: 1100px) 92vw, 860px"
              />
              <div class="article-toolbar">
                <button class="button button-secondary" type="button" data-copy-url="${article.canonicalUrl}">Share</button>
                <a class="button button-secondary" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(article.title)}&url=${encodeURIComponent(article.canonicalUrl)}" target="_blank" rel="noreferrer">Share on X</a>
              </div>
              <section class="sidebar-box">
                <h2 class="section-title small-title">Table of contents</h2>
                <ol class="toc-list">${toc}</ol>
              </section>
              <div class="article-content">${contentWithAnchors}</div>
              <section class="author-box sidebar-box">
                <h2 class="section-title small-title">About the author</h2>
                <p><strong>${escapeHtml(article.author.name)}</strong> - ${escapeHtml(article.author.role || "")}</p>
                <p class="muted-copy">${escapeHtml(article.author.bio || "")}</p>
              </section>
              ${internalLinksBlock}
              <section class="related-posts">
                <div class="section-header"><h2 class="section-title">Related posts</h2></div>
                <div class="news-grid">${relatedArticles.map((related) => renderArticleCard(related, prefix)).join("")}</div>
              </section>
            </article>
            <aside class="article-sidebar">
              <section class="sidebar-box">
                <div class="section-header compact-header"><h2 class="section-title">Trending</h2></div>
                ${renderSidebarItems(sidebarArticles, prefix)}
              </section>
              <section class="sidebar-box">
                <div class="section-header compact-header"><h2 class="section-title">Tags</h2></div>
                <div class="tag-row">${buildTagPills(article.tags, prefix)}</div>
              </section>
            </aside>
          </div>
        </div>
      </main>
      ${renderStaticFooter(prefix)}
      <script type="module" src="${prefix}assets/js/staticPage.js?v=${ASSET_VERSION}"></script>
    </body>
  </html>`;
}

function generateSitemap(entries) {
  const uniqueEntries = Array.from(new Map(entries.map((entry) => [entry.path, entry])).values()).sort((left, right) =>
    left.path.localeCompare(right.path)
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${uniqueEntries
  .map(
    (item) => `  <url>
    <loc>${escapeXml(`${SITE_BASE_URL}${item.path}`)}</loc>
    <lastmod>${item.lastmod}</lastmod>
    <changefreq>${item.changefreq || "weekly"}</changefreq>
    <priority>${item.priority || "0.6"}</priority>
  </url>`
  )
  .join("\n")}
</urlset>
`;
}

function generateNewsSitemap(articles = []) {
  const cutoff = Date.now() - NEWS_SITEMAP_MAX_AGE_MS;
  const recentArticles = [...articles]
    .filter((article) => {
      const published = new Date(article.publishDate);
      return !Number.isNaN(published.getTime()) && published.getTime() >= cutoff;
    })
    .sort((left, right) => new Date(right.publishDate).getTime() - new Date(left.publishDate).getTime())
    .slice(0, NEWS_SITEMAP_LIMIT);

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${recentArticles
  .map(
    (article) => `  <url>
    <loc>${escapeXml(article.canonicalUrl || articleUrl(article.slug))}</loc>
    <news:news>
      <news:publication>
        <news:name>${escapeXml(SITE_NAME)}</news:name>
        <news:language>${PRIMARY_LANGUAGE}</news:language>
      </news:publication>
      <news:publication_date>${escapeXml(article.publishDate)}</news:publication_date>
      <news:title>${escapeXml(article.title)}</news:title>
    </news:news>
  </url>`
  )
  .join("\n")}
</urlset>
`;
}

function getLatestLastmod(articles = []) {
  return articles
    .map((article) => article.updatedDate || article.publishDate)
    .filter(Boolean)
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] || new Date().toISOString();
}

function enrichArticles(allArticles) {
  const keywordMap = new Map(
    [...getKeywordRecords().cats.highVolume, ...getKeywordRecords().cats.longTail, ...getKeywordRecords().dogs.highVolume, ...getKeywordRecords().dogs.longTail]
      .map((record) => [record.keyword.toLowerCase(), record])
  );
  return allArticles.map((article) => {
    const keywordRecord = keywordMap.get((article.keyword || "").toLowerCase());
    const enriched = normalizeArticle({
      ...article,
      intent: article.intent || keywordRecord?.intent || "",
      cluster: article.cluster || keywordRecord?.cluster || "",
      topicType: article.topicType || keywordRecord?.type || "",
      canonicalUrl: articleUrl(article.slug),
      headings: collectHeadings(article.content),
      seoTitle: buildSeoTitle(article),
      seoDescription: buildSeoDescription(article),
      seoKeywords: buildSeoKeywords(article),
    });
    const related = buildRelatedPosts(allArticles, enriched);
    return normalizeArticle({
      ...enriched,
      relatedPostIds: related.map((item) => item.slug),
    });
  });
}

function resetGeneratedDirs() {
  [path.join(ROOT_DIR, "content", "posts"), POSTS_DIR, CATEGORIES_DIR, TAGS_DIR].forEach((dir) => {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    ensureDir(dir);
  });
}

function seedStarterArticles() {
  divider("Seeding starter articles");
  resetGeneratedDirs();
  getInitialSeedTopics().forEach((topic, index) => {
    saveArticle(buildSeedArticle(topic, loadArticles(), index));
  });
  return loadArticles();
}

function syncPublishingData(allArticles, forceReset = false) {
  const history = loadPublishingHistory();
  if (forceReset || !history.items.length) {
    savePublishingHistory({
      updatedAt: new Date().toISOString(),
      items: allArticles.slice(0, 30).map((article) => ({
        slug: article.slug,
        keyword: article.keyword,
        category: article.category,
        intent: article.intent || "",
        cluster: article.cluster || "",
        publishDate: article.publishDate,
        source: article.source || "seed",
      })),
    });
  }

  const queue = loadTopicQueue();
  if (forceReset || !queue.queue.length) {
    saveTopicQueue({
      updatedAt: new Date().toISOString(),
      queue: buildTopicQueue(allArticles.map((article) => article.keyword)),
    });
  }
}

function writeSupportFiles(allArticles) {
  const summaries = allArticles.map((article) => summarizeArticle(article));
  const summaryBySlug = new Map(summaries.map((article) => [article.slug, article]));
  const searchIndex = allArticles.map((article) => buildSearchEntry(article, summaryBySlug.get(article.slug)));
  const categories = Object.keys(CATEGORY_LABELS).map((key) =>
    buildCategoryDigest(
      key,
      summaries.filter((article) => article.category === key)
    )
  );
  const siteFeeds = buildSiteFeeds(summaries);
  const tags = Array.from(new Set(summaries.flatMap((article) => article.tags))).sort();

  writeJson(ARTICLES_FILE, summaries);
  writeJson(CATEGORY_INDEX_FILE, categories);
  writeJson(SEARCH_INDEX_FILE, searchIndex);
  writeJson(SITE_FEEDS_FILE, siteFeeds);
  writeJson(path.join(DATA_DIR, "categories.json"), categories);
  writeJson(path.join(DATA_DIR, "tags.json"), tags);
  writeJson(KEYWORDS_FILE, getKeywordData());
  writeJson(KEYWORD_CLUSTERS_FILE, getKeywordClusters());
  writeJson(VIRAL_TITLES_FILE, getViralTitles());
}

function writeStaticPages(allArticles) {
  divider("Writing static pages");
  [POSTS_DIR, CATEGORIES_DIR, TAGS_DIR].forEach((dir) => {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    ensureDir(dir);
  });

  allArticles.forEach((article) => {
    const related = buildRelatedPosts(allArticles, article);
    const sidebar = allArticles.filter((item) => item.slug !== article.slug).slice(0, 5);
    const dir = path.join(POSTS_DIR, article.slug);
    ensureDir(dir);
    writeText(path.join(dir, "index.html"), renderArticlePage(article, related, sidebar, allArticles));
  });

  Object.entries(CATEGORY_LABELS).forEach(([category, label]) => {
    const dir = path.join(CATEGORIES_DIR, category);
    ensureDir(dir);
    writeText(
      path.join(dir, "index.html"),
      renderCollectionPage({
        title: `${label} news and care guides`,
        description:
          category === "cats"
            ? "Daily cat news, feeding guides, behavior explainers, and indoor care routines."
            : "Daily dog news, feeding guides, behavior explainers, training plans, and health routines.",
        articles: allArticles.filter((article) => article.category === category),
        canonicalPath: `/categories/${category}/`,
      })
    );
  });

  const tags = Array.from(new Set(allArticles.flatMap((article) => article.tags))).sort();
  tags.forEach((tag) => {
    const dir = path.join(TAGS_DIR, slugify(tag));
    ensureDir(dir);
    writeText(
      path.join(dir, "index.html"),
      renderCollectionPage({
        title: `${tag} articles`,
        description: `PetZone coverage tagged ${tag}, including related posts and topical links.`,
        articles: allArticles.filter((article) => article.tags.includes(tag)),
        canonicalPath: `/tags/${slugify(tag)}/`,
      })
    );
  });

  const latestArticleDate = getLatestLastmod(allArticles);
  const staticPages = [
    { path: "/", priority: "1.0", changefreq: "daily", lastmod: latestArticleDate },
    { path: "/about.html", priority: "0.4", changefreq: "monthly", lastmod: latestArticleDate },
    { path: "/contact.html", priority: "0.3", changefreq: "monthly", lastmod: latestArticleDate },
    { path: "/privacy.html", priority: "0.2", changefreq: "monthly", lastmod: latestArticleDate },
    { path: "/terms.html", priority: "0.2", changefreq: "monthly", lastmod: latestArticleDate },
    { path: "/faq.html", priority: "0.5", changefreq: "monthly", lastmod: latestArticleDate },
  ];

  const articlePages = allArticles.map((article) => ({
    path: `/posts/${article.slug}/`,
    lastmod: article.updatedDate || article.publishDate,
    priority: article.featured ? "0.9" : "0.8",
    changefreq: "weekly",
  }));
  const categoryPages = Object.keys(CATEGORY_LABELS).map((category) => ({
    path: `/categories/${category}/`,
    lastmod: getLatestLastmod(allArticles.filter((article) => article.category === category)),
    priority: "0.7",
    changefreq: "daily",
  }));
  const tagPages = tags.map((tag) => ({
    path: `/tags/${slugify(tag)}/`,
    lastmod: getLatestLastmod(allArticles.filter((article) => article.tags.includes(tag))),
    priority: "0.5",
    changefreq: "weekly",
  }));

  writeText(path.join(ROOT_DIR, "sitemap.xml"), generateSitemap([...staticPages, ...articlePages, ...categoryPages, ...tagPages]));
  writeText(path.join(ROOT_DIR, "news-sitemap.xml"), generateNewsSitemap(allArticles));
  writeText(
    path.join(ROOT_DIR, "robots.txt"),
    `User-agent: *\nAllow: /\nDisallow: /admin.html\nSitemap: ${SITE_BASE_URL}/sitemap.xml\nSitemap: ${SITE_BASE_URL}/news-sitemap.xml\n`
  );
}

function updateIndexes(options = {}) {
  ensureBaseDirs();
  const existingArticles = loadArticles();
  if (options.seed || (options.seedIfEmpty && existingArticles.length === 0)) {
    seedStarterArticles();
  }

  const allArticles = enrichArticles(loadArticles().map((article) => normalizeArticle(article)));
  if (!allArticles.length) {
    warn("No articles were found during index generation.");
  }

  allArticles.forEach((article) => saveArticle(article));

  writeSupportFiles(allArticles);
  writeStaticPages(allArticles);
  syncPublishingData(allArticles, options.seed || options.seedIfEmpty);
  info(`Updated indexes for ${allArticles.length} articles.`);
  return allArticles;
}

if (require.main === module) {
  updateIndexes({
    seed: process.argv.includes("--seed"),
    seedIfEmpty: process.argv.includes("--seed-if-empty"),
  });
}

module.exports = {
  updateIndexes,
};
