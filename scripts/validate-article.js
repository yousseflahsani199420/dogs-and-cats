const {
  collectHeadings,
  findDuplicateArticles,
  loadArticles,
  readJson,
  stripHtml,
} = require("./lib/content-utils");

function validateArticle(article, existingArticles = []) {
  const errors = [];
  const warnings = [];
  const plainContent = stripHtml(article.content || "");
  const wordCount = plainContent.split(/\s+/).filter(Boolean).length;
  const headings = collectHeadings(article.content || "");
  const h2Count = (article.content || "").match(/<h2>/g) || [];
  const h3Count = (article.content || "").match(/<h3>/g) || [];
  const paragraphs = (article.content || "").match(/<p>/g) || [];
  const listCount = (article.content || "").match(/<(ul|ol)>/g) || [];
  const paragraphWordCounts = (article.content || "")
    .match(/<p>(.*?)<\/p>/g) || [];
  const maxParagraphWords = paragraphWordCounts.reduce((max, paragraphHtml) => {
    const count = stripHtml(paragraphHtml).split(/\s+/).filter(Boolean).length;
    return Math.max(max, count);
  }, 0);
  const duplicateMatches = findDuplicateArticles(article, existingArticles, {
    titleThreshold: 0.88,
    contentThreshold: 0.76,
  });

  if (wordCount < 900) {
    errors.push(`Article is too short: ${wordCount} words.`);
  }
  if (wordCount > 3200) {
    warnings.push(`Article is very long: ${wordCount} words.`);
  }
  if (!article.title || article.title.length < 40 || article.title.length > 110) {
    errors.push("Title must be between 40 and 110 characters.");
  }
  if (!article.seoTitle || article.seoTitle.length < 40 || article.seoTitle.length > 70) {
    errors.push("SEO title must be between 40 and 70 characters.");
  }
  if (!article.seoDescription || article.seoDescription.length < 120 || article.seoDescription.length > 170) {
    errors.push("SEO description must be between 120 and 170 characters.");
  }
  if (!article.excerpt || article.excerpt.length < 110 || article.excerpt.length > 220) {
    errors.push("Excerpt must be between 110 and 220 characters.");
  }
  if (!article.slug) {
    errors.push("Slug is required.");
  }
  if (article.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug)) {
    errors.push("Slug must contain only lowercase letters, numbers, and hyphens.");
  }
  if (article.slug && article.slug.length > 90) {
    errors.push("Slug must be 90 characters or fewer.");
  }
  if (existingArticles.some((item) => item.slug === article.slug && item.id !== article.id)) {
    errors.push(`Slug "${article.slug}" already exists.`);
  }
  if (existingArticles.some((item) => item.title === article.title && item.id !== article.id)) {
    errors.push(`Title "${article.title}" already exists.`);
  }
  if (article.keyword && existingArticles.some((item) => item.keyword === article.keyword && item.id !== article.id)) {
    errors.push(`Keyword "${article.keyword}" is already in use.`);
  }
  if (!article.category) {
    errors.push("Category is required.");
  }
  if (!Array.isArray(article.tags) || article.tags.length < 3) {
    errors.push("At least 3 tags are required.");
  }
  if (Array.isArray(article.tags) && new Set(article.tags.map((tag) => tag.toLowerCase())).size !== article.tags.length) {
    errors.push("Tags must be unique.");
  }
  if (!Array.isArray(article.seoKeywords) || article.seoKeywords.length < 3) {
    errors.push("At least 3 SEO keywords are required.");
  }
  if (!Array.isArray(article.faqItems) || article.faqItems.length < 3) {
    errors.push("At least 3 FAQ items are required.");
  }
  if (Array.isArray(article.faqItems) && article.faqItems.some((item) => !item.question || !item.answer || item.answer.length < 45)) {
    errors.push("Each FAQ item needs a question and an answer of at least 45 characters.");
  }
  if (Array.isArray(article.faqItems)) {
    const questions = article.faqItems.map((item) => (item.question || "").trim().toLowerCase()).filter(Boolean);
    if (new Set(questions).size !== questions.length) {
      errors.push("FAQ questions must be unique.");
    }
  }
  if (headings.length < 3) {
    errors.push("At least 3 subheadings are required.");
  }
  if (h2Count.length < 3) {
    errors.push("At least 3 H2 headings are required.");
  }
  if (h3Count.length < 3) {
    errors.push("At least 3 H3 headings are required.");
  }
  if (new Set(headings.map((heading) => heading.toLowerCase())).size !== headings.length) {
    errors.push("Headings must be unique.");
  }
  if (paragraphs.length < 5) {
    errors.push("At least 5 paragraphs are required.");
  }
  if (listCount.length < 1) {
    errors.push("At least 1 bullet or numbered list is required.");
  }
  if (!Array.isArray(article.internalLinkSuggestions) || article.internalLinkSuggestions.length < 3) {
    errors.push("At least 3 internal link suggestions are required.");
  }
  if (Array.isArray(article.internalLinkSuggestions) && article.internalLinkSuggestions.some((item) => !item.slug || !item.anchor)) {
    errors.push("Every internal link suggestion must include a slug and anchor text.");
  }
  if (Array.isArray(article.internalLinkSuggestions)) {
    const linkSlugs = article.internalLinkSuggestions.map((item) => item.slug).filter(Boolean);
    if (new Set(linkSlugs).size !== linkSlugs.length) {
      errors.push("Internal link suggestions must be unique.");
    }
    const existingSlugs = new Set(existingArticles.map((item) => item.slug));
    const missingInternalLinks = linkSlugs.filter((slug) => !existingSlugs.has(slug));
    if (existingArticles.length && missingInternalLinks.length) {
      errors.push(`Internal links must resolve to existing articles: ${missingInternalLinks.slice(0, 3).join(", ")}`);
    }
  }
  if (!article.canonicalUrl || !article.canonicalUrl.includes(article.slug)) {
    errors.push("Canonical URL must exist and include the article slug.");
  }
  if (!article.featuredImagePrompt || article.featuredImagePrompt.length < 40) {
    warnings.push("Featured image prompt is missing or too short.");
  }
  if (maxParagraphWords > 140) {
    warnings.push(`One or more paragraphs are long for readability (${maxParagraphWords} words).`);
  }
  if (/^#|\n#|^\*|^- /m.test(article.content || "")) {
    errors.push("Content still appears to contain raw markdown.");
  }
  if (duplicateMatches.length) {
    errors.push(`Duplicate-content prevention flagged similar articles: ${duplicateMatches.slice(0, 3).map((item) => item.slug).join(", ")}`);
  }
  if (!article.author?.name) {
    warnings.push("Author name is missing.");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      wordCount,
      headingCount: headings.length,
      h2Count: h2Count.length,
      h3Count: h3Count.length,
      paragraphCount: paragraphs.length,
      listCount: listCount.length,
      maxParagraphWords,
      duplicateMatches: duplicateMatches.length,
    },
  };
}

if (require.main === module) {
  const targetPath = process.argv[2];
  if (!targetPath) {
    throw new Error("Pass a post JSON file path to validate.");
  }
  const article = readJson(targetPath, null);
  if (!article) {
    throw new Error(`Unable to read article file: ${targetPath}`);
  }
  const result = validateArticle(article, loadArticles());
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.valid) {
    process.exitCode = 1;
  }
}

module.exports = {
  validateArticle,
};
