import { PETZONE_CONFIG } from "./config.js";
import { canonicalUrl, estimateReadingTimeFromHtml, slugify, stripHtml } from "./utils.js";

function encodePath(pathname = "") {
  return pathname
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function encodeBase64Utf8(value = "") {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function excerptFromHtml(html = "", maxLength = 170) {
  const clean = stripHtml(html);
  if (clean.length <= maxLength) {
    return clean;
  }
  return `${clean.slice(0, maxLength).trim().replace(/[,.!?;:]+$/g, "")}...`;
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

function normalizeCategoryLabel(category = "") {
  return slugify(category) === "dogs" ? "Dogs" : "Cats";
}

function normalizeTags(values = []) {
  const seen = new Set();
  return values
    .map((value) => value?.toString().trim())
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function normalizeFaqItems(items = []) {
  return (items || [])
    .map((item) => ({
      question: item?.question?.toString().trim() || "",
      answer: item?.answer?.toString().trim() || "",
    }))
    .filter((item) => item.question && item.answer);
}

function normalizeArticleForGitHub(article) {
  const slug = slugify(article.slug || article.title || article.id || "");
  const category = slugify(article.category || "cats") === "dogs" ? "dogs" : "cats";
  const publishDate = article.publishDate || new Date().toISOString();
  const updatedDate = new Date().toISOString();
  const content = article.content?.toString().trim() || "<p></p>";
  const tags = normalizeTags(article.tags || []);
  const seoKeywords = normalizeTags(article.seoKeywords || tags);
  const faqItems = normalizeFaqItems(article.faqItems || []);

  return {
    id: article.id || slug,
    title: article.title?.toString().trim() || slug,
    slug,
    keyword: article.keyword?.toString().trim() || article.title?.toString().trim() || slug,
    excerpt: article.excerpt?.toString().trim() || excerptFromHtml(content),
    content,
    category,
    categoryLabel: normalizeCategoryLabel(category),
    intent: article.intent || "",
    cluster: article.cluster || "",
    topicType: article.topicType || "",
    tags,
    featuredImage: article.featuredImage || "assets/images/placeholder-pet.svg",
    imageAlt: article.imageAlt?.toString().trim() || article.title?.toString().trim() || "",
    author: article.author || PETZONE_CONFIG.defaultAuthor,
    publishDate,
    updatedDate,
    featured: Boolean(article.featured),
    trending: Boolean(article.trending),
    status: article.status || "published",
    seoTitle: article.seoTitle?.toString().trim() || "",
    seoDescription: article.seoDescription?.toString().trim() || "",
    seoKeywords,
    faqItems,
    schemaType: article.schemaType || "BlogPosting",
    readingTime: estimateReadingTimeFromHtml(content),
    relatedPostIds: Array.isArray(article.relatedPostIds) ? article.relatedPostIds : [],
    internalLinkSuggestions: Array.isArray(article.internalLinkSuggestions) ? article.internalLinkSuggestions : [],
    score: article.score || null,
    canonicalUrl: canonicalUrl(`/posts/${slug}/`),
    source: "github-admin",
    headings: collectHeadings(content),
    featuredImagePrompt: article.featuredImagePrompt || "",
  };
}

async function githubRequest(config, token, endpoint, options = {}) {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    method: options.method || "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.message || `GitHub request failed (${response.status}).`;
    throw new Error(message);
  }

  return data;
}

function buildRepoPath(config) {
  return `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
}

async function getContentFile(config, token, filePath) {
  try {
    return await githubRequest(
      config,
      token,
      `${buildRepoPath(config)}/contents/${encodePath(filePath)}?ref=${encodeURIComponent(config.branch)}`
    );
  } catch (error) {
    if (/not found/i.test(error.message)) {
      return null;
    }
    throw error;
  }
}

async function putContentFile(config, token, filePath, content, message) {
  const existing = await getContentFile(config, token, filePath);
  return githubRequest(config, token, `${buildRepoPath(config)}/contents/${encodePath(filePath)}`, {
    method: "PUT",
    body: {
      message,
      content: encodeBase64Utf8(content),
      branch: config.branch,
      sha: existing?.sha,
    },
  });
}

async function deleteContentFile(config, token, filePath, message) {
  const existing = await getContentFile(config, token, filePath);
  if (!existing?.sha) {
    return null;
  }

  return githubRequest(config, token, `${buildRepoPath(config)}/contents/${encodePath(filePath)}`, {
    method: "DELETE",
    body: {
      message,
      branch: config.branch,
      sha: existing.sha,
    },
  });
}

export function getActionsUrl(config = {}) {
  if (!config.owner || !config.repo) {
    return "";
  }
  return `https://github.com/${config.owner}/${config.repo}/actions`;
}

export async function testGitHubConnection(config = {}, token = "") {
  if (!config.owner || !config.repo || !config.branch) {
    throw new Error("Owner, repo, and branch are required.");
  }
  if (!token) {
    throw new Error("GitHub token is required.");
  }

  const repo = await githubRequest(config, token, `${buildRepoPath(config)}`);
  await githubRequest(
    config,
    token,
    `${buildRepoPath(config)}/branches/${encodeURIComponent(config.branch)}`
  );

  return {
    fullName: repo.full_name,
    private: Boolean(repo.private),
    defaultBranch: repo.default_branch,
    actionsUrl: getActionsUrl(config),
  };
}

export async function publishArticleToGitHub(article, { config, token, previousSlug = "" } = {}) {
  if (!config?.owner || !config?.repo || !config?.branch) {
    throw new Error("GitHub publishing settings are incomplete.");
  }
  if (!token) {
    throw new Error("GitHub token is missing.");
  }

  const normalized = normalizeArticleForGitHub(article);
  const contentDir = (config.contentDir || PETZONE_CONFIG.githubPublishDefaults.contentDir).replace(/^\/+|\/+$/g, "");
  const filePath = `${contentDir}/${normalized.slug}.json`;
  const payload = `${JSON.stringify(normalized, null, 2)}\n`;

  const result = await putContentFile(
    config,
    token,
    filePath,
    payload,
    `chore(content): publish ${normalized.slug} from admin`
  );

  const previous = slugify(previousSlug || "");
  if (previous && previous !== normalized.slug) {
    await deleteContentFile(
      config,
      token,
      `${contentDir}/${previous}.json`,
      `chore(content): remove old slug ${previous} from admin`
    );
  }

  return {
    article: normalized,
    commitSha: result?.commit?.sha || "",
    filePath,
    actionsUrl: getActionsUrl(config),
  };
}
