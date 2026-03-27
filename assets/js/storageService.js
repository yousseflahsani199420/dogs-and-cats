import { PETZONE_CONFIG } from "./config.js";
import { slugify } from "./utils.js";

const memoryStorage = new Map();

function readRawStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.warn(`Storage raw read failed for ${key}`, error);
    return memoryStorage.has(key) ? memoryStorage.get(key) : null;
  }
}

function writeRawStorage(key, value) {
  try {
    localStorage.setItem(key, value);
    memoryStorage.delete(key);
    return true;
  } catch (error) {
    console.warn(`Storage raw write failed for ${key}`, error);
    memoryStorage.set(key, value);
    return false;
  }
}

function removeRawStorage(key) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.warn(`Storage raw remove failed for ${key}`, error);
  }
  memoryStorage.delete(key);
}

function readStorage(key, fallback) {
  try {
    const raw = readRawStorage(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.warn(`Storage read failed for ${key}`, error);
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    writeRawStorage(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Storage write failed for ${key}`, error);
  }
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readArrayStorage(key, fallback = []) {
  const value = readStorage(key, fallback);
  if (Array.isArray(value)) {
    return value;
  }
  console.warn(`Storage value for ${key} was not an array. Ignoring stale data.`);
  return fallback;
}

function readObjectStorage(key, fallback = null) {
  const value = readStorage(key, fallback);
  if (value === null || value === undefined) {
    return fallback;
  }
  if (isPlainObject(value)) {
    return value;
  }
  console.warn(`Storage value for ${key} was not an object. Ignoring stale data.`);
  return fallback;
}

function normalizeString(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }
  return value.toString();
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeString(item).trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeFaqItems(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item) => isPlainObject(item))
    .map((item) => ({
      question: normalizeString(item.question).trim(),
      answer: normalizeString(item.answer).trim(),
    }))
    .filter((item) => item.question && item.answer);
}

function normalizeIsoDate(value, fallback) {
  const raw = normalizeString(value).trim();
  if (!raw) {
    return fallback;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }
  return date.toISOString();
}

function normalizeAuthor(value) {
  const source = isPlainObject(value) ? value : {};
  return {
    name: normalizeString(source.name, PETZONE_CONFIG.defaultAuthor.name).trim() || PETZONE_CONFIG.defaultAuthor.name,
    role: normalizeString(source.role, PETZONE_CONFIG.defaultAuthor.role).trim() || PETZONE_CONFIG.defaultAuthor.role,
    bio: normalizeString(source.bio, PETZONE_CONFIG.defaultAuthor.bio).trim() || PETZONE_CONFIG.defaultAuthor.bio,
  };
}

export function normalizeArticleRecord(article, {
  fallbackId = `local-${Date.now()}`,
  fallbackSource = "local-admin",
} = {}) {
  if (!isPlainObject(article)) {
    return null;
  }

  const rawTitle = normalizeString(article.title).trim();
  const rawKeyword = normalizeString(article.keyword).trim();
  const rawSlug = normalizeString(article.slug || article.id || rawTitle || rawKeyword).trim();
  const slug = slugify(rawSlug) || slugify(rawTitle) || slugify(rawKeyword) || fallbackId;
  const category = normalizeString(article.category).trim().toLowerCase() === "dogs" ? "dogs" : "cats";
  const publishDate = normalizeIsoDate(article.publishDate, normalizeIsoDate(article.updatedDate, new Date().toISOString()));
  const updatedDate = normalizeIsoDate(article.updatedDate, publishDate);
  const tags = normalizeStringArray(article.tags);
  const seoKeywords = normalizeStringArray(article.seoKeywords);
  const contentImages = normalizeStringArray(article.contentImages);
  const internalLinkSuggestions = normalizeStringArray(article.internalLinkSuggestions);
  const relatedPostIds = normalizeStringArray(article.relatedPostIds);
  const faqItems = normalizeFaqItems(article.faqItems);
  const readingTime = Number.isFinite(Number(article.readingTime)) && Number(article.readingTime) > 0
    ? Number(article.readingTime)
    : 3;

  return {
    ...article,
    id: normalizeString(article.id).trim() || slug || fallbackId,
    title: rawTitle || rawKeyword || "Untitled Article",
    slug,
    keyword: rawKeyword,
    excerpt: normalizeString(article.excerpt).trim(),
    content: normalizeString(article.content),
    category,
    categoryLabel: category === "dogs" ? "Dogs" : "Cats",
    tags,
    featuredImage: normalizeString(article.featuredImage).trim() || "assets/images/placeholder-pet.svg",
    contentImages,
    imageAlt: normalizeString(article.imageAlt).trim() || rawTitle || "PetZone article image",
    author: normalizeAuthor(article.author),
    publishDate,
    updatedDate,
    status: normalizeString(article.status).trim().toLowerCase() === "draft" ? "draft" : "published",
    featured: Boolean(article.featured),
    trending: Boolean(article.trending),
    seoTitle: normalizeString(article.seoTitle).trim(),
    seoDescription: normalizeString(article.seoDescription).trim(),
    seoKeywords: seoKeywords.length ? seoKeywords : tags,
    faqItems,
    readingTime,
    internalLinkSuggestions,
    relatedPostIds,
    source: normalizeString(article.source).trim() || fallbackSource,
    canonicalUrl: normalizeString(article.canonicalUrl).trim(),
    originalSlug: normalizeString(article.originalSlug).trim(),
    remoteCommitSha: normalizeString(article.remoteCommitSha).trim(),
    remotePublishedAt: normalizeIsoDate(article.remotePublishedAt, ""),
    deleted: Boolean(article.deleted),
  };
}

function readSessionValue(key, fallback = "") {
  try {
    return sessionStorage.getItem(key) ?? fallback;
  } catch (error) {
    console.warn(`Session storage read failed for ${key}`, error);
    return fallback;
  }
}

function writeSessionValue(key, value) {
  try {
    if (value) {
      sessionStorage.setItem(key, value);
      return;
    }
    sessionStorage.removeItem(key);
  } catch (error) {
    console.warn(`Session storage write failed for ${key}`, error);
  }
}

export function getAdminArticles() {
  return readArrayStorage(PETZONE_CONFIG.adminStorageKey, [])
    .map((article, index) => normalizeArticleRecord(article, { fallbackId: `local-${index}` }))
    .filter(Boolean)
    .filter((article) => Boolean(article.slug || article.id || article.title));
}

export function saveAdminArticles(articles) {
  writeStorage(PETZONE_CONFIG.adminStorageKey, Array.isArray(articles) ? articles : []);
}

export function clearAdminArticles() {
  removeRawStorage(PETZONE_CONFIG.adminStorageKey);
}

export function upsertAdminArticle(article) {
  const current = getAdminArticles();
  const index = current.findIndex((item) => item.id === article.id || item.slug === article.slug);
  if (index >= 0) {
    current[index] = article;
  } else {
    current.unshift(article);
  }
  saveAdminArticles(current);
  return article;
}

export function deleteAdminArticle(articleId) {
  const next = getAdminArticles().filter((article) => article.id !== articleId);
  saveAdminArticles(next);
}

export function mergeArticles(defaultArticles = []) {
  const localArticles = getAdminArticles();
  const bySlug = new Map(
    defaultArticles
      .map((article, index) => normalizeArticleRecord(article, { fallbackId: `remote-${index}`, fallbackSource: "site-build" }))
      .filter(Boolean)
      .map((article) => [article.slug, article])
  );
  localArticles.forEach((article) => {
    bySlug.set(article.slug, article);
  });
  return Array.from(bySlug.values())
    .filter((article) => !article.deleted)
    .sort(
    (left, right) => new Date(right.publishDate || right.updatedDate).getTime() - new Date(left.publishDate || left.updatedDate).getTime()
    );
}

export function saveNewsletterSubscriber(email) {
  const subscribers = readArrayStorage(PETZONE_CONFIG.newsletterStorageKey, []);
  if (!subscribers.includes(email)) {
    subscribers.push(email);
    writeStorage(PETZONE_CONFIG.newsletterStorageKey, subscribers);
  }
  return subscribers.length;
}

export function getNewsletterSubscribers() {
  return readArrayStorage(PETZONE_CONFIG.newsletterStorageKey, []);
}

export function getAdminSession() {
  const legacy = readRawStorage(PETZONE_CONFIG.adminSessionKey);
  if (legacy === "true") {
    return { username: "admin", loginAt: null };
  }
  const session = readObjectStorage(PETZONE_CONFIG.adminSessionKey, null);
  return session?.username ? session : null;
}

export function isAdminLoggedIn() {
  const session = getAdminSession();
  return Boolean(session && session.username);
}

export function setAdminSession(session) {
  if (session?.username) {
    writeStorage(PETZONE_CONFIG.adminSessionKey, session);
  } else {
    removeRawStorage(PETZONE_CONFIG.adminSessionKey);
  }
}

export function clearAdminSession() {
  removeRawStorage(PETZONE_CONFIG.adminSessionKey);
}

export function setAdminLoggedIn(isLoggedIn) {
  if (isLoggedIn) {
    setAdminSession({ username: "admin", loginAt: new Date().toISOString() });
    return;
  }
  clearAdminSession();
}

export function getGitHubPublishConfig() {
  return {
    ...PETZONE_CONFIG.githubPublishDefaults,
    ...readObjectStorage(PETZONE_CONFIG.githubPublishConfigKey, {}),
  };
}

export function saveGitHubPublishConfig(config = {}) {
  writeStorage(PETZONE_CONFIG.githubPublishConfigKey, {
    ...PETZONE_CONFIG.githubPublishDefaults,
    ...config,
  });
}

export function clearGitHubPublishConfig() {
  removeRawStorage(PETZONE_CONFIG.githubPublishConfigKey);
}

export function getGitHubPublishToken() {
  return readSessionValue(PETZONE_CONFIG.githubPublishTokenKey, "");
}

export function saveGitHubPublishToken(token = "") {
  writeSessionValue(PETZONE_CONFIG.githubPublishTokenKey, token.trim());
}

export function clearGitHubPublishToken() {
  writeSessionValue(PETZONE_CONFIG.githubPublishTokenKey, "");
}
