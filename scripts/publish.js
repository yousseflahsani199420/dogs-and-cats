const { execFileSync } = require("child_process");
const { ROOT_DIR } = require("./lib/constants");
const {
  loadArticles,
  loadPublishingHistory,
  loadTopicQueue,
  saveArticle,
  savePublishingHistory,
  saveTopicQueue,
} = require("./lib/content-utils");
const { createArticleFromTopic } = require("./generate-article");
const { getDailyPublishingPlan, selectTopicBatch } = require("./select-topic");
const { updateIndexes } = require("./update-indexes");
const { validateArticle } = require("./validate-article");
const { appendSummary, endGroup, error, info, setOutput, startGroup } = require("./lib/logger");

function commitChanges(articles) {
  execFileSync("git", ["add", "."], { cwd: ROOT_DIR, stdio: "inherit" });
  const label =
    articles.length === 1
      ? `publish ${articles[0].slug}`
      : `publish ${articles.length} PetZone articles`;
  execFileSync("git", ["commit", "-m", `chore(content): ${label}`], {
    cwd: ROOT_DIR,
    stdio: "inherit",
  });
}

async function publishDailyArticle(options = {}) {
  const source = options.source || (process.env.CI ? "ai" : process.env.AI_API_KEY ? "ai" : "seed");
  if (source === "ai" && !process.env.AI_API_KEY) {
    throw new Error("AI_API_KEY is required for live publishing.");
  }
  const plan = options.plan || getDailyPublishingPlan();

  startGroup("Topic selection");
  const selection = selectTopicBatch({ plan });
  info(
    "Selected topics",
    selection.topics.map((topic) => ({
      keyword: topic.keyword,
      category: topic.category,
      intent: topic.intent,
    }))
  );
  endGroup();

  const existingArticles = loadArticles();
  const publishedArticles = [];
  const validationResults = [];

  for (const [index, topic] of selection.topics.entries()) {
    startGroup(`Generate and validate article ${index + 1}/${selection.topics.length}`);
    const article = await createArticleFromTopic(topic, {
      source,
      existingArticles: [...existingArticles, ...publishedArticles],
      index: existingArticles.length + publishedArticles.length,
    });
    article.publishDate = new Date(Date.now() + index * 1000).toISOString();
    article.updatedDate = article.publishDate;

    const validation = validateArticle(article, [...existingArticles, ...publishedArticles]);
    info("Validation stats", {
      slug: article.slug,
      category: article.category,
      ...validation.stats,
    });
    if (!validation.valid) {
      error("Article validation failed", { article: article.slug, validation });
      endGroup();
      throw new Error(`Article validation failed for ${article.slug}: ${validation.errors.join(" | ")}`);
    }

    publishedArticles.push(article);
    validationResults.push(validation);
    info("Prepared article", {
      title: article.title,
      slug: article.slug,
      category: article.category,
      keyword: article.keyword,
    });
    endGroup();
  }

  startGroup("Persisting articles");
  publishedArticles.forEach((article) => saveArticle(article));
  updateIndexes();
  endGroup();

  const history = loadPublishingHistory();
  history.updatedAt = new Date().toISOString();
  const historyEntries = publishedArticles
    .map((article) => ({
      slug: article.slug,
      keyword: article.keyword,
      category: article.category,
      intent: article.intent || "",
      cluster: article.cluster || "",
      publishDate: article.publishDate,
      source,
    }))
    .sort((left, right) => new Date(right.publishDate).getTime() - new Date(left.publishDate).getTime());
  history.items = [...historyEntries, ...history.items];
  history.items = history.items.slice(0, 400);
  savePublishingHistory(history);

  const queue = loadTopicQueue();
  queue.updatedAt = new Date().toISOString();
  const selectedKeywords = new Set(publishedArticles.map((article) => article.keyword.toLowerCase()));
  queue.queue = (queue.queue.length ? queue.queue : selection.queueState.queue).filter(
    (item) => !selectedKeywords.has(item.keyword.toLowerCase())
  );
  saveTopicQueue(queue);

  const countsByCategory = publishedArticles.reduce((accumulator, article) => {
    accumulator[article.category] = (accumulator[article.category] || 0) + 1;
    return accumulator;
  }, {});

  setOutput("article_count", publishedArticles.length);
  setOutput("article_slugs", publishedArticles.map((article) => article.slug).join(","));
  setOutput("article_categories", Object.entries(countsByCategory).map(([key, count]) => `${key}:${count}`).join(","));
  appendSummary([
    "## PetZone Daily Publish",
    `- Total articles: ${publishedArticles.length}`,
    `- Cats published: ${countsByCategory.cats || 0}`,
    `- Dogs published: ${countsByCategory.dogs || 0}`,
    ...publishedArticles.map(
      (article, index) =>
        `- ${index + 1}. ${article.title} | ${article.category} | ${article.slug} | ${article.readingTime} min | ${validationResults[index].stats.wordCount} words`
    ),
  ]);

  if (options.commit) {
    commitChanges(publishedArticles);
  }

  info("Published article batch", {
    count: publishedArticles.length,
    categories: countsByCategory,
    slugs: publishedArticles.map((article) => article.slug),
  });
  return publishedArticles;
}

if (require.main === module) {
  publishDailyArticle({
    commit: process.argv.includes("--commit"),
    source: process.env.CI ? "ai" : process.env.AI_API_KEY ? "ai" : "seed",
  })
    .then(() => {
      process.exit(0);
    })
    .catch((caughtError) => {
      error("PetZone publish failed", { message: caughtError.message, stack: caughtError.stack });
      process.exit(1);
    });
}

module.exports = {
  publishDailyArticle,
};
