const fs = require("fs");
const path = require("path");
const {
  ARTICLES_FILE,
  CATEGORY_LABELS,
  CONTENT_DIR,
  DATA_DIR,
  PUBLISHING_HISTORY_FILE,
  SEARCH_INDEX_FILE,
  SITE_BASE_URL,
  TOPIC_QUEUE_FILE,
} = require("./constants");

function normalizeWhitespace(value = "") {
  return value
    .toString()
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function ensureBaseDirs() {
  [CONTENT_DIR, DATA_DIR, path.dirname(ARTICLES_FILE), path.dirname(SEARCH_INDEX_FILE)].forEach(ensureDir);
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.warn(`Failed to read JSON from ${filePath}:`, error.message);
    return fallback;
  }
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

function writeText(filePath, value) {
  ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, value, "utf8");
  fs.renameSync(tempPath, filePath);
}

function slugify(value = "", options = {}) {
  const maxLength = options.maxLength || 90;
  const fallback = options.fallback || "petzone-post";
  const normalizedSource = value
    .toString()
    .replace(/[|:].*$/g, "")
    .replace(
      /\b(a clear practical guide|what smart owners prioritize|a first-time owner guide|a practical routine that sticks|what it usually means and what helps|what to watch and what to do next|what actually delivers better results)\b/gi,
      " "
    );
  const slug = normalizedSource
    .toString()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, maxLength)
    .replace(/-+$/g, "");

  return slug || fallback;
}

function createUniqueSlug(value, existingSlugs = [], options = {}) {
  const maxLength = options.maxLength || 90;
  const base = slugify(value, { ...options, maxLength });
  const taken = new Set(existingSlugs.filter(Boolean));
  if (!taken.has(base)) {
    return base;
  }
  let counter = 2;
  let suffix = `-${counter}`;
  let trimmedBase = base.slice(0, Math.max(1, maxLength - suffix.length)).replace(/-+$/g, "");
  let candidate = `${trimmedBase}${suffix}`;
  while (taken.has(candidate)) {
    counter += 1;
    suffix = `-${counter}`;
    trimmedBase = base.slice(0, Math.max(1, maxLength - suffix.length)).replace(/-+$/g, "");
    candidate = `${trimmedBase}${suffix}`;
  }
  return candidate;
}

function stripHtml(html = "") {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function escapeHtml(value = "") {
  return value
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeHtml(html = "") {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

function estimateReadingTime(html = "") {
  const words = stripHtml(html).split(/\s+/).filter(Boolean).length;
  return Math.max(3, Math.ceil(words / 210));
}

function articleUrl(slug) {
  return `${SITE_BASE_URL}/posts/${slug}/`;
}

function categoryUrl(category) {
  return `${SITE_BASE_URL}/categories/${slugify(category)}/`;
}

function tagUrl(tag) {
  return `${SITE_BASE_URL}/tags/${slugify(tag)}/`;
}

function collectHeadings(html = "") {
  const headings = [];
  const pattern = /<h[23][^>]*>(.*?)<\/h[23]>/gi;
  let match = pattern.exec(html);
  while (match) {
    headings.push(stripHtml(match[1]));
    match = pattern.exec(html);
  }
  return headings;
}

function markdownToHtml(markdown = "") {
  const lines = normalizeWhitespace(markdown).split("\n");
  const html = [];
  let listType = "";

  function closeList() {
    if (listType) {
      html.push(`</${listType}>`);
      listType = "";
    }
  }

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      closeList();
      return;
    }

    if (/^###\s+/.test(trimmed)) {
      closeList();
      html.push(`<h3>${escapeHtml(trimmed.replace(/^###\s+/, ""))}</h3>`);
      return;
    }

    if (/^##\s+/.test(trimmed)) {
      closeList();
      html.push(`<h2>${escapeHtml(trimmed.replace(/^##\s+/, ""))}</h2>`);
      return;
    }

    if (/^#\s+/.test(trimmed)) {
      closeList();
      html.push(`<h2>${escapeHtml(trimmed.replace(/^#\s+/, ""))}</h2>`);
      return;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      if (listType !== "ul") {
        closeList();
        listType = "ul";
        html.push("<ul>");
      }
      html.push(`<li>${escapeHtml(trimmed.replace(/^[-*]\s+/, ""))}</li>`);
      return;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      if (listType !== "ol") {
        closeList();
        listType = "ol";
        html.push("<ol>");
      }
      html.push(`<li>${escapeHtml(trimmed.replace(/^\d+\.\s+/, ""))}</li>`);
      return;
    }

    closeList();
    html.push(`<p>${escapeHtml(trimmed)}</p>`);
  });

  closeList();
  return html.join("\n");
}

function cleanupGeneratedHtml(html = "") {
  return sanitizeHtml(html)
    .replace(/```[\s\S]*?```/g, "")
    .replace(/<h1>/gi, "<h2>")
    .replace(/<\/h1>/gi, "</h2>")
    .replace(/<p>\s*<\/p>/g, "")
    .replace(/<h([23])>\s*<\/h\1>/g, "")
    .replace(/\s+<\/(p|li|h2|h3|ul|ol)>/g, "</$1>")
    .replace(/<(p|li|h2|h3)>\s+/g, "<$1>")
    .replace(/<strong>\s*<\/strong>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeGeneratedContent(content = "") {
  const input = normalizeWhitespace(content)
    .replace(/```html|```markdown|```md|```/gi, "")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)/gi, '<a href="$2">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^\u2022\s+/gm, "- ");
  if (!input) {
    return "";
  }
  const html = /<\/?[a-z][\s\S]*>/i.test(input) ? input : markdownToHtml(input);
  return cleanupGeneratedHtml(html);
}

function excerptFromHtml(html = "", limit = 170) {
  const plain = stripHtml(html);
  if (plain.length <= limit) {
    return plain;
  }
  return `${plain.slice(0, limit).trim().replace(/[,.!?;:]+$/g, "")}...`;
}

function tokenizeText(value = "") {
  return stripHtml(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);
}

function createShingles(tokens = [], size = 3) {
  const set = new Set();
  for (let index = 0; index <= tokens.length - size; index += 1) {
    set.add(tokens.slice(index, index + size).join(" "));
  }
  return set;
}

function extractComparableText(html = "") {
  return normalizeGeneratedContent(html)
    .replace(/<section class="internal-links-block">[\s\S]*?<\/section>/gi, " ")
    .replace(/<section class="faq-snippet">[\s\S]*?<\/section>/gi, " ")
    .replace(/<section class="sidebar-box">[\s\S]*?<\/section>/gi, " ")
    .replace(/petzone publishes related articles in topical clusters[\s\S]*?<\/p>/gi, " ")
    .replace(/this week's focus:[^<]+/gi, " ")
    .replace(/weekly checkpoint:[^<]+/gi, " ")
    .replace(/reader checklist:[^<]+/gi, " ");
}

function jaccardSimilarity(leftSet, rightSet) {
  if (!leftSet.size || !rightSet.size) {
    return 0;
  }
  let intersection = 0;
  leftSet.forEach((item) => {
    if (rightSet.has(item)) {
      intersection += 1;
    }
  });
  return intersection / (leftSet.size + rightSet.size - intersection);
}

function contentSimilarity(left = "", right = "") {
  const leftShingles = createShingles(tokenizeText(extractComparableText(left)), 4);
  const rightShingles = createShingles(tokenizeText(extractComparableText(right)), 4);
  return jaccardSimilarity(leftShingles, rightShingles);
}

function titleSimilarity(left = "", right = "") {
  const leftTokens = new Set(tokenizeText(left));
  const rightTokens = new Set(tokenizeText(right));
  return jaccardSimilarity(leftTokens, rightTokens);
}

function keywordSimilarity(left = "", right = "") {
  const leftTokens = new Set(tokenizeText(left));
  const rightTokens = new Set(tokenizeText(right));
  return jaccardSimilarity(leftTokens, rightTokens);
}

function findDuplicateArticles(candidate, existingArticles = [], options = {}) {
  const titleThreshold = options.titleThreshold || 0.84;
  const contentThreshold = options.contentThreshold || 0.72;
  const similar = [];

  existingArticles.forEach((article) => {
    if (candidate.id && article.id === candidate.id) {
      return;
    }
    const titleScore = titleSimilarity(candidate.title || "", article.title || "");
    const contentScore = contentSimilarity(candidate.content || "", article.content || "");
    const keywordScore = keywordSimilarity(candidate.keyword || candidate.title || "", article.keyword || article.title || "");
    const exactKeyword = Boolean(candidate.keyword && article.keyword && candidate.keyword.toLowerCase() === article.keyword.toLowerCase());
    const exactSlug = Boolean(candidate.slug && article.slug && candidate.slug === article.slug);
    if (
      exactKeyword ||
      exactSlug ||
      titleScore >= titleThreshold ||
      (contentScore >= contentThreshold && (titleScore >= 0.56 || keywordScore >= 0.34))
    ) {
      similar.push({
        slug: article.slug,
        title: article.title,
        exactKeyword,
        exactSlug,
        titleScore: Number(titleScore.toFixed(3)),
        contentScore: Number(contentScore.toFixed(3)),
        keywordScore: Number(keywordScore.toFixed(3)),
      });
    }
  });

  return similar.sort((left, right) => (right.contentScore + right.titleScore) - (left.contentScore + left.titleScore));
}

function getPostFilePath(slug) {
  return path.join(CONTENT_DIR, `${slug}.json`);
}

function listPostFiles() {
  ensureDir(CONTENT_DIR);
  return fs
    .readdirSync(CONTENT_DIR)
    .filter((file) => file.endsWith(".json"))
    .map((file) => path.join(CONTENT_DIR, file));
}

function loadArticles() {
  return listPostFiles()
    .map((filePath) => readJson(filePath, null))
    .filter(Boolean)
    .map(normalizeArticle)
    .sort((left, right) => new Date(right.publishDate).getTime() - new Date(left.publishDate).getTime());
}

function normalizeArticle(article) {
  const normalizedContent = normalizeGeneratedContent(article.content || "");
  const uniqueKeywords = [];
  const seenKeywords = new Set();
  (article.seoKeywords || [])
    .map((tag) => tag.toString().trim())
    .filter(Boolean)
    .forEach((tag) => {
      const key = tag.toLowerCase();
      if (!seenKeywords.has(key)) {
        seenKeywords.add(key);
        uniqueKeywords.push(tag);
      }
    });
  const normalized = {
    ...article,
    category: slugify(article.category || "cats"),
    categoryLabel: CATEGORY_LABELS[slugify(article.category || "cats")] || "Pets",
    status: article.status || "published",
    tags: Array.from(new Set((article.tags || []).map((tag) => tag.toString().trim()).filter(Boolean))),
    faqItems: Array.isArray(article.faqItems) ? article.faqItems : [],
    seoKeywords: uniqueKeywords,
    content: normalizedContent,
  };
  normalized.slug = slugify(normalized.slug || normalized.title || normalized.id);
  normalized.id = normalized.id || normalized.slug;
  normalized.excerpt = normalized.excerpt || excerptFromHtml(normalized.content);
  normalized.readingTime = normalized.readingTime || estimateReadingTime(normalized.content);
  normalized.canonicalUrl = normalized.canonicalUrl || articleUrl(normalized.slug);
  normalized.headings = normalized.headings || collectHeadings(normalized.content);
  normalized.publishDate = normalized.publishDate || new Date().toISOString();
  normalized.updatedDate = normalized.updatedDate || normalized.publishDate;
  normalized.keyword = normalized.keyword || normalized.title;
  return normalized;
}

function orderArticleForWrite(article) {
  const normalized = normalizeArticle(article);
  return {
    id: normalized.id,
    title: normalized.title,
    slug: normalized.slug,
    keyword: normalized.keyword,
    excerpt: normalized.excerpt,
    content: normalized.content,
    category: normalized.category,
    categoryLabel: normalized.categoryLabel,
    intent: normalized.intent || "",
    cluster: normalized.cluster || "",
    topicType: normalized.topicType || "",
    tags: normalized.tags,
    featuredImage: normalized.featuredImage,
    imageAlt: normalized.imageAlt || "",
    author: normalized.author || {},
    publishDate: normalized.publishDate,
    updatedDate: normalized.updatedDate,
    featured: Boolean(normalized.featured),
    trending: Boolean(normalized.trending),
    status: normalized.status,
    seoTitle: normalized.seoTitle || "",
    seoDescription: normalized.seoDescription || "",
    seoKeywords: normalized.seoKeywords,
    faqItems: normalized.faqItems,
    schemaType: normalized.schemaType || "BlogPosting",
    readingTime: normalized.readingTime,
    relatedPostIds: normalized.relatedPostIds || [],
    internalLinkSuggestions: normalized.internalLinkSuggestions || [],
    score: normalized.score || null,
    canonicalUrl: normalized.canonicalUrl,
    source: normalized.source || "",
    headings: normalized.headings || [],
    featuredImagePrompt: normalized.featuredImagePrompt || "",
  };
}

function saveArticle(article) {
  const ordered = orderArticleForWrite(article);
  writeJson(getPostFilePath(ordered.slug), ordered);
  return ordered;
}

function loadPublishingHistory() {
  return readJson(PUBLISHING_HISTORY_FILE, { updatedAt: null, items: [] });
}

function savePublishingHistory(history) {
  writeJson(PUBLISHING_HISTORY_FILE, history);
}

function loadTopicQueue() {
  return readJson(TOPIC_QUEUE_FILE, { updatedAt: null, queue: [] });
}

function saveTopicQueue(queue) {
  writeJson(TOPIC_QUEUE_FILE, queue);
}

module.exports = {
  ensureDir,
  ensureBaseDirs,
  readJson,
  writeJson,
  writeText,
  escapeHtml,
  slugify,
  createUniqueSlug,
  normalizeWhitespace,
  stripHtml,
  sanitizeHtml,
  normalizeGeneratedContent,
  estimateReadingTime,
  articleUrl,
  categoryUrl,
  tagUrl,
  collectHeadings,
  excerptFromHtml,
  tokenizeText,
  titleSimilarity,
  contentSimilarity,
  keywordSimilarity,
  findDuplicateArticles,
  getPostFilePath,
  listPostFiles,
  loadArticles,
  normalizeArticle,
  orderArticleForWrite,
  saveArticle,
  loadPublishingHistory,
  savePublishingHistory,
  loadTopicQueue,
  saveTopicQueue,
};
