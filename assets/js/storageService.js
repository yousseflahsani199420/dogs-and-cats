import { PETZONE_CONFIG } from "./config.js";

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.warn(`Storage read failed for ${key}`, error);
    return fallback;
  }
}

function writeStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getAdminArticles() {
  return readStorage(PETZONE_CONFIG.adminStorageKey, []);
}

export function saveAdminArticles(articles) {
  writeStorage(PETZONE_CONFIG.adminStorageKey, articles);
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
  const bySlug = new Map(defaultArticles.map((article) => [article.slug, article]));
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
  const subscribers = readStorage(PETZONE_CONFIG.newsletterStorageKey, []);
  if (!subscribers.includes(email)) {
    subscribers.push(email);
    writeStorage(PETZONE_CONFIG.newsletterStorageKey, subscribers);
  }
  return subscribers.length;
}

export function getNewsletterSubscribers() {
  return readStorage(PETZONE_CONFIG.newsletterStorageKey, []);
}

export function getAdminSession() {
  const legacy = localStorage.getItem(PETZONE_CONFIG.adminSessionKey);
  if (legacy === "true") {
    return { username: "admin", loginAt: null };
  }
  return readStorage(PETZONE_CONFIG.adminSessionKey, null);
}

export function isAdminLoggedIn() {
  const session = getAdminSession();
  return Boolean(session && session.username);
}

export function setAdminSession(session) {
  if (session?.username) {
    writeStorage(PETZONE_CONFIG.adminSessionKey, session);
  } else {
    localStorage.removeItem(PETZONE_CONFIG.adminSessionKey);
  }
}

export function clearAdminSession() {
  localStorage.removeItem(PETZONE_CONFIG.adminSessionKey);
}

export function setAdminLoggedIn(isLoggedIn) {
  if (isLoggedIn) {
    setAdminSession({ username: "admin", loginAt: new Date().toISOString() });
    return;
  }
  clearAdminSession();
}
