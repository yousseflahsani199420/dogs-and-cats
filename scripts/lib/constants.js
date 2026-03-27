const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "../..");

module.exports = {
  ROOT_DIR,
  CONTENT_DIR: path.join(ROOT_DIR, "content", "posts"),
  DATA_DIR: path.join(ROOT_DIR, "data"),
  POSTS_DIR: path.join(ROOT_DIR, "posts"),
  CATEGORIES_DIR: path.join(ROOT_DIR, "categories"),
  TAGS_DIR: path.join(ROOT_DIR, "tags"),
  DOCS_DIR: path.join(ROOT_DIR, "docs"),
  ASSETS_DIR: path.join(ROOT_DIR, "assets"),
  SITE_NAME: "PetZone",
  SITE_TAGLINE: "Cats & Dogs Daily",
  SITE_DESCRIPTION:
    "PetZone is a fast static pet news site covering cats and dogs with SEO-ready care, food, behavior, and health reporting.",
  GA_MEASUREMENT_ID: "G-G94YSLLJZC",
  DEFAULT_AUTHOR: {
    name: "PetZone Editorial Team",
    role: "Pet care newsroom",
    bio: "Editors and researchers producing practical reporting for cat and dog owners with a file-based publishing workflow.",
  },
  SITE_BASE_URL: (process.env.SITE_BASE_URL || "https://petzone.website").replace(/\/$/, ""),
  DEFAULT_IMAGE: "assets/images/placeholder-pet.svg",
  DEFAULT_OG_IMAGE: "assets/images/og-default.svg",
  PUBLISHING_HISTORY_FILE: path.join(ROOT_DIR, "data", "publishing-history.json"),
  TOPIC_QUEUE_FILE: path.join(ROOT_DIR, "data", "topic-queue.json"),
  ARTICLES_FILE: path.join(ROOT_DIR, "data", "articles.json"),
  SITE_FEEDS_FILE: path.join(ROOT_DIR, "data", "site-feeds.json"),
  CATEGORY_INDEX_FILE: path.join(ROOT_DIR, "data", "category-index.json"),
  SEARCH_INDEX_FILE: path.join(ROOT_DIR, "data", "search-index.json"),
  KEYWORDS_FILE: path.join(ROOT_DIR, "data", "keywords.json"),
  KEYWORD_CLUSTERS_FILE: path.join(ROOT_DIR, "data", "keyword-clusters.json"),
  VIRAL_TITLES_FILE: path.join(ROOT_DIR, "data", "viral_titles.json"),
  CATEGORY_LABELS: {
    cats: "Cats",
    dogs: "Dogs",
  },
};
