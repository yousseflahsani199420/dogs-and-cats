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
const { selectNextTopic } = require("./select-topic");
const { updateIndexes } = require("./update-indexes");
const { validateArticle } = require("./validate-article");
const { appendSummary, endGroup, error, info, setOutput, startGroup } = require("./lib/logger");

function commitChanges(article) {
  execFileSync("git", ["add", "."], { cwd: ROOT_DIR, stdio: "inherit" });
  execFileSync("git", ["commit", "-m", `chore(content): publish ${article.slug}`], {
    cwd: ROOT_DIR,
    stdio: "inherit",
  });
}

async function publishDailyArticle(options = {}) {
  const source = options.source || (process.env.CI ? "ai" : process.env.AI_API_KEY ? "ai" : "seed");
  if (source === "ai" && !process.env.AI_API_KEY) {
    throw new Error("AI_API_KEY is required for live publishing.");
  }

  startGroup("Topic selection");
  const selection = selectNextTopic();
  info("Selected topic", selection.topic);
  endGroup();

  const existingArticles = loadArticles();
  const article = await createArticleFromTopic(selection.topic, {
    source,
    existingArticles,
    index: existingArticles.length,
  });
  article.publishDate = new Date().toISOString();
  article.updatedDate = article.publishDate;

  startGroup("Article validation");
  const validation = validateArticle(article, existingArticles);
  info("Validation stats", validation.stats);
  if (!validation.valid) {
    error("Article validation failed", validation);
    endGroup();
    throw new Error(`Article validation failed: ${validation.errors.join(" | ")}`);
  }
  endGroup();

  startGroup("Persisting article");
  saveArticle(article);
  updateIndexes();
  endGroup();

  const history = loadPublishingHistory();
  history.updatedAt = new Date().toISOString();
  history.items.unshift({
    slug: article.slug,
    keyword: article.keyword,
    category: article.category,
    intent: article.intent || selection.topic.intent,
    cluster: article.cluster || selection.topic.cluster,
    publishDate: article.publishDate,
    source,
  });
  history.items = history.items.slice(0, 400);
  savePublishingHistory(history);

  const queue = loadTopicQueue();
  queue.updatedAt = new Date().toISOString();
  queue.queue = (queue.queue.length ? queue.queue : selection.queueState.queue).filter(
    (item) => item.keyword !== selection.topic.keyword
  );
  saveTopicQueue(queue);

  setOutput("article_slug", article.slug);
  setOutput("article_title", article.title);
  setOutput("article_category", article.category);
  appendSummary([
    "## PetZone Daily Publish",
    `- Title: ${article.title}`,
    `- Slug: ${article.slug}`,
    `- Category: ${article.category}`,
    `- Keyword: ${article.keyword}`,
    `- Reading time: ${article.readingTime} minutes`,
    `- Validation word count: ${validation.stats.wordCount}`,
  ]);

  if (options.commit) {
    commitChanges(article);
  }

  info(`Published ${article.slug}`);
  return article;
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
