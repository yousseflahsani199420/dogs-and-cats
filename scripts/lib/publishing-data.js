const { CATEGORY_LABELS, SITE_NAME } = require("./constants");
const { excerptFromHtml, slugify, stripHtml, tokenizeText } = require("./content-utils");

function clampText(value = "", maxLength = 160) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) {
    return clean;
  }
  return `${clean.slice(0, maxLength - 3).trim().replace(/[,:;.!?-]+$/g, "")}...`;
}

function titleCaseWords(value = "") {
  return value.replace(/\b\w/g, (character) => character.toUpperCase());
}

function buildSeoTitle(article) {
  const base = (article.seoTitle || article.title || "").replace(/\s+\|\s+PetZone$/i, "").trim();
  const candidate = base.length >= 44 ? base : `${base} | ${titleCaseWords(article.categoryLabel || CATEGORY_LABELS[article.category] || "Pets")} Guide`;
  if (candidate.length <= 64) {
    return `${candidate} | ${SITE_NAME}`.slice(0, 69).trim();
  }
  return clampText(candidate, 66);
}

function buildSeoDescription(article) {
  const existing = (article.seoDescription || "").trim();
  if (existing.length >= 135 && existing.length <= 165) {
    return existing;
  }
  const categoryLabel = (article.categoryLabel || CATEGORY_LABELS[article.category] || "pets").toLowerCase();
  const fallback = `${article.title}. PetZone covers ${article.keyword || article.title} with practical ${categoryLabel} reporting, key takeaways, and related guidance for owners.`;
  return clampText(existing || article.excerpt || excerptFromHtml(article.content || "", 180) || fallback, 158);
}

function buildSeoKeywords(article) {
  const normalizedTitle = (article.title || "").split(":")[0].trim();
  const candidates = [
    article.keyword,
    normalizedTitle && normalizedTitle.toLowerCase() !== (article.keyword || "").toLowerCase() ? normalizedTitle : "",
    article.cluster ? article.cluster.replace(/-/g, " ") : "",
    ...(article.tags || []),
    article.categoryLabel || CATEGORY_LABELS[article.category] || "",
  ]
    .map((value) => value.toString().trim())
    .filter(Boolean);

  const seen = new Set();
  return candidates
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}

function buildSearchTerms(article) {
  const phrases = [
    article.title,
    article.excerpt,
    article.keyword,
    article.categoryLabel || CATEGORY_LABELS[article.category] || article.category,
    article.intent,
    article.cluster ? article.cluster.replace(/-/g, " ") : "",
    ...(article.tags || []),
    ...(article.headings || []).slice(0, 8),
  ]
    .filter((value) => value !== undefined && value !== null)
    .map((value) => value.toString().trim().toLowerCase())
    .filter(Boolean);

  const tokens = Array.from(
    new Set(
      phrases.flatMap((value) => tokenizeText(value))
    )
  );

  return {
    phrases: Array.from(new Set(phrases)),
    tokens,
  };
}

function summarizeArticle(article) {
  return {
    id: article.id,
    title: article.title,
    slug: article.slug,
    keyword: article.keyword,
    excerpt: article.excerpt,
    category: article.category,
    categoryLabel: article.categoryLabel || CATEGORY_LABELS[article.category] || "Pets",
    intent: article.intent || "",
    cluster: article.cluster || "",
    topicType: article.topicType || "",
    tags: article.tags || [],
    featuredImage: article.featuredImage,
    imageAlt: article.imageAlt || article.title,
    author: {
      name: article.author?.name || "",
      role: article.author?.role || "",
    },
    publishDate: article.publishDate,
    updatedDate: article.updatedDate,
    featured: Boolean(article.featured),
    trending: Boolean(article.trending),
    status: article.status || "published",
    seoTitle: buildSeoTitle(article),
    seoDescription: buildSeoDescription(article),
    seoKeywords: buildSeoKeywords(article),
    readingTime: article.readingTime,
    relatedPostIds: article.relatedPostIds || [],
    canonicalUrl: article.canonicalUrl,
  };
}

function buildSearchEntry(article, summary) {
  const terms = buildSearchTerms(article);
  return {
    slug: summary.slug,
    title: summary.title,
    excerpt: summary.excerpt,
    category: summary.category,
    categoryLabel: summary.categoryLabel,
    keyword: summary.keyword,
    intent: summary.intent,
    cluster: summary.cluster,
    tags: summary.tags,
    headings: article.headings || [],
    publishDate: summary.publishDate,
    updatedDate: summary.updatedDate,
    readingTime: summary.readingTime,
    canonicalUrl: summary.canonicalUrl,
    url: `/posts/${summary.slug}/`,
    terms: terms.phrases,
    tokens: terms.tokens,
    boost: (summary.featured ? 5 : 0) + (summary.trending ? 4 : 0),
  };
}

function buildCategoryDigest(category, articles = []) {
  const label = CATEGORY_LABELS[category] || titleCaseWords(category);
  const tags = Array.from(new Set(articles.flatMap((article) => article.tags || [])));
  const intents = Array.from(new Set(articles.map((article) => article.intent).filter(Boolean)));
  return {
    key: category,
    label,
    count: articles.length,
    description:
      category === "cats"
        ? "Cat news, feeding explainers, behavior coverage, and daily home-care reporting."
        : "Dog news, training explainers, behavior coverage, and daily home-care reporting.",
    leadSlug: articles[0]?.slug || "",
    featuredSlugs: articles.filter((article) => article.featured).slice(0, 4).map((article) => article.slug),
    trendingSlugs: articles.filter((article) => article.trending).slice(0, 5).map((article) => article.slug),
    recentSlugs: articles.slice(0, 16).map((article) => article.slug),
    topTags: tags
      .sort((left, right) => left.localeCompare(right))
      .slice(0, 10),
    intents,
    updatedAt: articles[0]?.updatedDate || articles[0]?.publishDate || new Date().toISOString(),
  };
}

function buildSiteFeeds(summaries = []) {
  const cats = summaries.filter((article) => article.category === "cats");
  const dogs = summaries.filter((article) => article.category === "dogs");
  return {
    updatedAt: summaries[0]?.updatedDate || summaries[0]?.publishDate || new Date().toISOString(),
    hero: {
      lead: (summaries.find((article) => article.featured) || summaries[0] || {}).slug || "",
      side: summaries.filter((article) => article.slug !== (summaries.find((item) => item.featured) || summaries[0] || {}).slug).slice(0, 4).map((article) => article.slug),
    },
    latest: summaries.slice(0, 16).map((article) => article.slug),
    headlines: summaries.slice(0, 24).map((article) => article.slug),
    trending: summaries.filter((article) => article.trending).slice(0, 8).map((article) => article.slug),
    popular: summaries
      .slice()
      .sort((left, right) => {
        const leftScore = left.readingTime + (left.trending ? 2 : 0) + (left.featured ? 3 : 0);
        const rightScore = right.readingTime + (right.trending ? 2 : 0) + (right.featured ? 3 : 0);
        return rightScore - leftScore;
      })
      .slice(0, 8)
      .map((article) => article.slug),
    cats: cats.slice(0, 10).map((article) => article.slug),
    dogs: dogs.slice(0, 10).map((article) => article.slug),
    spotlightTags: Array.from(new Set(summaries.flatMap((article) => article.tags || [])))
      .sort((left, right) => left.localeCompare(right))
      .slice(0, 16)
      .map((tag) => ({ label: tag, slug: slugify(tag) })),
  };
}

module.exports = {
  buildSeoTitle,
  buildSeoDescription,
  buildSeoKeywords,
  summarizeArticle,
  buildSearchEntry,
  buildCategoryDigest,
  buildSiteFeeds,
  clampText,
};
