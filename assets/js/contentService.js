import { fetchJson, getQueryParam, uniqueBy } from "./utils.js";
import { getAdminArticles, mergeArticles } from "./storageService.js";

let articleSummaryCache = null;
let articleContentCache = new Map();
let searchIndexCache = null;
let publishingHistoryCache = null;
let topicQueueCache = null;
let siteFeedsCache = null;
let categoryIndexCache = null;

function sortByNewest(left, right) {
  return new Date(right.publishDate).getTime() - new Date(left.publishDate).getTime();
}

function buildSpotlightTags(articles = []) {
  return uniqueBy(
    articles.flatMap((article) => (article.tags || []).map((tag) => ({ label: tag }))),
    (item) => item.label
  ).slice(0, 8);
}

function buildFallbackSearchIndex(articles = []) {
  return articles.map((article) => ({
    slug: article.slug,
    title: article.title,
    excerpt: article.excerpt,
    category: article.category,
    tags: article.tags || [],
    keywords: article.seoKeywords || article.tags || [],
    headings: article.headings || [],
    readingTime: article.readingTime,
    publishDate: article.publishDate,
    scoreBoost: (article.featured ? 2 : 0) + (article.trending ? 2 : 0),
  }));
}

function buildFallbackSiteFeeds(articles = []) {
  const featured = articles.filter((article) => article.featured);
  const trending = articles.filter((article) => article.trending);
  const cats = articles.filter((article) => article.category === "cats");
  const dogs = articles.filter((article) => article.category === "dogs");
  const headlineSource = trending.length ? trending : articles;

  return {
    hero: {
      lead: (featured[0] || articles[0] || {}).slug,
      side: (featured.slice(1, 5).length ? featured.slice(1, 5) : articles.slice(1, 5)).map((article) => article.slug),
    },
    latest: articles.slice(0, 12).map((article) => article.slug),
    headlines: headlineSource.slice(0, 12).map((article) => article.slug),
    cats: cats.slice(0, 8).map((article) => article.slug),
    dogs: dogs.slice(0, 8).map((article) => article.slug),
    trending: (trending.length ? trending : articles).slice(0, 8).map((article) => article.slug),
    popular: uniqueBy([...featured, ...trending, ...articles], (article) => article.slug).slice(0, 8).map((article) => article.slug),
    spotlightTags: buildSpotlightTags(articles),
  };
}

function buildFallbackCategoryIndex(articles = []) {
  return ["cats", "dogs"].map((category) => {
    const items = articles.filter((article) => article.category === category);
    return {
      key: category,
      label: category === "dogs" ? "Dogs" : "Cats",
      count: items.length,
      leadSlug: items[0]?.slug || "",
      featuredSlugs: items.filter((article) => article.featured).slice(0, 5).map((article) => article.slug),
      topTags: uniqueBy(
        items.flatMap((article) => (article.tags || []).map((tag) => ({ tag }))),
        (item) => item.tag
      ).slice(0, 8).map((item) => item.tag),
    };
  });
}

export async function getAllArticles() {
  if (!articleSummaryCache) {
    const baseArticles = await fetchJson("data/articles.json");
    articleSummaryCache = mergeArticles(baseArticles).sort(sortByNewest);
  }
  return articleSummaryCache;
}

export function clearArticleCache() {
  articleSummaryCache = null;
  articleContentCache = new Map();
  searchIndexCache = null;
  publishingHistoryCache = null;
  topicQueueCache = null;
  siteFeedsCache = null;
  categoryIndexCache = null;
}

export async function getArticleBySlug(slug) {
  const localArticle = getAdminArticles().find((article) => article.slug === slug && !article.deleted);
  if (localArticle?.content) {
    return localArticle;
  }
  if (!articleContentCache.has(slug)) {
    articleContentCache.set(
      slug,
      fetchJson(`content/posts/${slug}.json`).catch(() => null)
    );
  }
  const article = await articleContentCache.get(slug);
  if (!article) {
    const summaries = await getAllArticles();
    return summaries.find((item) => item.slug === slug) || null;
  }
  return localArticle ? { ...article, ...localArticle } : article;
}

export async function getSearchIndex() {
  if (!searchIndexCache) {
    try {
      searchIndexCache = await fetchJson("data/search-index.json");
    } catch (error) {
      console.warn("Falling back to article-derived search index.", error);
      searchIndexCache = buildFallbackSearchIndex(await getAllArticles());
    }
  }
  return searchIndexCache;
}

export async function getSiteFeeds() {
  if (!siteFeedsCache) {
    try {
      siteFeedsCache = await fetchJson("data/site-feeds.json");
    } catch (error) {
      console.warn("Falling back to article-derived site feeds.", error);
      siteFeedsCache = buildFallbackSiteFeeds(await getAllArticles());
    }
  }
  return siteFeedsCache;
}

export async function getCategoryIndexes() {
  if (!categoryIndexCache) {
    try {
      categoryIndexCache = await fetchJson("data/category-index.json");
    } catch (error) {
      console.warn("Falling back to article-derived category indexes.", error);
      categoryIndexCache = buildFallbackCategoryIndex(await getAllArticles());
    }
  }
  return categoryIndexCache;
}

export async function getCategoryDigest(category) {
  const indexes = await getCategoryIndexes();
  return indexes.find((item) => item.key === category) || null;
}

export async function getPublishingHistory() {
  if (!publishingHistoryCache) {
    publishingHistoryCache = await fetchJson("data/publishing-history.json");
  }
  return publishingHistoryCache;
}

export async function getTopicQueue() {
  if (!topicQueueCache) {
    topicQueueCache = await fetchJson("data/topic-queue.json");
  }
  return topicQueueCache;
}

export function getFeaturedArticles(articles) {
  return articles.filter((article) => article.featured).slice(0, 5);
}

export function getTrendingArticles(articles) {
  return articles.filter((article) => article.trending).slice(0, 6);
}

export function getCategoryArticles(articles, category) {
  return articles.filter((article) => article.category === category);
}

export function getRelatedArticles(articles, currentArticle, count = 4) {
  if (Array.isArray(currentArticle.relatedPostIds) && currentArticle.relatedPostIds.length) {
    const bySlug = new Map(articles.map((article) => [article.slug, article]));
    const resolved = currentArticle.relatedPostIds.map((slug) => bySlug.get(slug)).filter(Boolean);
    if (resolved.length) {
      return resolved.slice(0, count);
    }
  }
  return articles
    .filter((article) => article.slug !== currentArticle.slug)
    .map((article) => ({
      article,
      score:
        article.tags.filter((tag) => currentArticle.tags.includes(tag)).length * 2 +
        (article.cluster && currentArticle.cluster && article.cluster === currentArticle.cluster ? 4 : 0) +
        (article.intent && currentArticle.intent && article.intent === currentArticle.intent ? 2 : 0) +
        (article.category === currentArticle.category ? 2 : 0),
    }))
    .sort((left, right) => right.score - left.score || sortByNewest(left.article, right.article))
    .slice(0, count)
    .map((item) => item.article);
}

export function getTopTags(articles) {
  return uniqueBy(
    articles.flatMap((article) => article.tags.map((tag) => ({ tag }))),
    (item) => item.tag
  ).map((item) => item.tag);
}

export function getRequestedCategory() {
  return getQueryParam("name") || "cats";
}
