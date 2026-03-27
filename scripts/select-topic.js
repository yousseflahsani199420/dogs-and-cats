const { buildTopicQueue, getKeywordRecords } = require("./lib/seed-data");
const { loadArticles, loadPublishingHistory, loadTopicQueue, saveTopicQueue } = require("./lib/content-utils");
const { info } = require("./lib/logger");

function normalizePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getDailyPublishingPlan() {
  const perCategory = normalizePositiveInteger(process.env.DAILY_POSTS_PER_CATEGORY, 2);
  const cats = normalizePositiveInteger(process.env.DAILY_CATS_POSTS, perCategory);
  const dogs = normalizePositiveInteger(process.env.DAILY_DOGS_POSTS, perCategory);
  return [
    { category: "cats", count: cats },
    { category: "dogs", count: dogs },
  ].filter((item) => item.count > 0);
}

function sharedKeywordTokens(left = "", right = "") {
  const leftTokens = new Set(left.toLowerCase().split(/\W+/).filter((token) => token.length > 3));
  const rightTokens = new Set(right.toLowerCase().split(/\W+/).filter((token) => token.length > 3));
  let matches = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) {
      matches += 1;
    }
  });
  return matches;
}

function chooseNextCategory(historyItems = []) {
  if (!historyItems.length) {
    return "cats";
  }
  const recent = historyItems.slice(0, 6);
  const catCount = recent.filter((item) => item.category === "cats").length;
  const dogCount = recent.filter((item) => item.category === "dogs").length;
  return catCount <= dogCount ? "cats" : "dogs";
}

function scoreTopic(topic, historyItems = [], preferredCategory = "cats") {
  const recent = historyItems.slice(0, 12);
  const recentClusters = recent.map((item) => item.cluster).filter(Boolean);
  const recentIntents = recent.map((item) => item.intent).filter(Boolean);
  const recentKeywords = recent.map((item) => item.keyword);
  let score = topic.priority || 0;

  if (topic.type === "longTail") {
    score += 18;
  }
  if (topic.category === preferredCategory) {
    score += 15;
  }
  if (!recentClusters.includes(topic.cluster)) {
    score += 12;
  } else {
    score -= 18;
  }
  if (!recentIntents.slice(0, 3).includes(topic.intent)) {
    score += 8;
  } else {
    score -= 8;
  }
  if (!recentKeywords.some((keyword) => sharedKeywordTokens(keyword, topic.keyword) >= 3)) {
    score += 10;
  } else {
    score -= 25;
  }

  const categoryRecencyPenalty = recent.findIndex((item) => item.category === topic.category);
  if (categoryRecencyPenalty === 0) {
    score -= 8;
  }

  return score;
}

function reconcileQueue(queueItems = [], usedKeywords = []) {
  const canonicalRecords = [...getKeywordRecords().cats.highVolume, ...getKeywordRecords().cats.longTail, ...getKeywordRecords().dogs.highVolume, ...getKeywordRecords().dogs.longTail];
  const canonicalMap = new Map(canonicalRecords.map((record) => [record.keyword.toLowerCase(), record]));
  const usedKeywordSet = new Set(usedKeywords.map((item) => item.toLowerCase()));
  const deduped = [];
  const seen = new Set();

  queueItems.forEach((item) => {
    const key = item.keyword.toLowerCase();
    if (seen.has(key) || usedKeywordSet.has(key)) {
      return;
    }
    const canonical = canonicalMap.get(key);
    if (canonical) {
      deduped.push(canonical);
      seen.add(key);
    }
  });

  canonicalRecords.forEach((record) => {
    const key = record.keyword.toLowerCase();
    if (!seen.has(key) && !usedKeywordSet.has(key)) {
      deduped.push(record);
      seen.add(key);
    }
  });

  return deduped;
}

function getQueueState(historyItems = [], existingQueueState = null, persist = true, usedKeywords = []) {
  let queueState = existingQueueState || loadTopicQueue();
  const archiveKeywords = usedKeywords.length
    ? usedKeywords
    : loadArticles().map((article) => (article.keyword || "").toLowerCase()).filter(Boolean);
  if (!queueState.queue.length) {
    queueState = {
      updatedAt: new Date().toISOString(),
      queue: buildTopicQueue(archiveKeywords),
    };
    if (persist) {
      saveTopicQueue(queueState);
    }
  } else {
    const reconciledQueue = reconcileQueue(queueState.queue, archiveKeywords);
    if (JSON.stringify(reconciledQueue) !== JSON.stringify(queueState.queue)) {
      queueState = {
        updatedAt: new Date().toISOString(),
        queue: reconciledQueue,
      };
      if (persist) {
        saveTopicQueue(queueState);
      }
    }
  }
  return queueState;
}

function selectNextTopic(options = {}) {
  const historyItems = options.historyItems || loadPublishingHistory().items;
  const preferredCategory = options.preferredCategory || chooseNextCategory(historyItems);
  const usedKeywords =
    options.usedKeywords
    || loadArticles().map((article) => (article.keyword || "").toLowerCase()).filter(Boolean);
  const queueState = getQueueState(historyItems, options.queueState, options.persistQueue !== false, usedKeywords);
  const excludedKeywords = new Set((options.excludeKeywords || []).map((keyword) => keyword.toLowerCase()));
  const targetCategory = options.category || null;

  const ranked = queueState.queue
    .filter((topic) => !excludedKeywords.has(topic.keyword.toLowerCase()))
    .filter((topic) => !targetCategory || topic.category === targetCategory)
    .map((topic) => ({
      ...topic,
      score: scoreTopic(topic, historyItems, preferredCategory),
    }))
    .sort((left, right) => right.score - left.score);

  const topic = ranked[0];

  if (!topic) {
    throw new Error(`No topic could be selected${targetCategory ? ` for category "${targetCategory}"` : ""} from the queue.`);
  }

  info("Topic selection result", {
    preferredCategory,
    chosenKeyword: topic.keyword,
    chosenCategory: topic.category,
    chosenIntent: topic.intent,
    score: topic.score,
  });

  return {
    topic,
    preferredCategory,
    queueState,
    rankedPreview: ranked.slice(0, 5),
  };
}

function selectTopicBatch(options = {}) {
  const history = loadPublishingHistory();
  const historyItems = [...(options.historyItems || history.items)];
  const usedKeywords =
    options.usedKeywords
    || loadArticles().map((article) => (article.keyword || "").toLowerCase()).filter(Boolean);
  const plan = options.plan || getDailyPublishingPlan();
  const queueState = getQueueState(historyItems, options.queueState, options.persistQueue !== false, usedKeywords);
  const selectedTopics = [];
  const excludedKeywords = [];
  let workingQueueState = queueState;
  let workingHistory = [...historyItems];
  let workingUsedKeywords = [...usedKeywords];

  plan.forEach((bucket) => {
    for (let index = 0; index < bucket.count; index += 1) {
      const selection = selectNextTopic({
        historyItems: workingHistory,
        queueState: workingQueueState,
        category: bucket.category,
        preferredCategory: bucket.category,
        excludeKeywords: excludedKeywords,
        usedKeywords: workingUsedKeywords,
        persistQueue: false,
      });

      selectedTopics.push(selection.topic);
      excludedKeywords.push(selection.topic.keyword);
      workingUsedKeywords.push(selection.topic.keyword.toLowerCase());
      workingQueueState = {
        updatedAt: new Date().toISOString(),
        queue: workingQueueState.queue.filter((item) => item.keyword.toLowerCase() !== selection.topic.keyword.toLowerCase()),
      };
      workingHistory = [
        {
          keyword: selection.topic.keyword,
          category: selection.topic.category,
          intent: selection.topic.intent,
          cluster: selection.topic.cluster,
          publishDate: new Date().toISOString(),
        },
        ...workingHistory,
      ];
    }
  });

  info("Daily batch topic plan", {
    plan,
    selectedKeywords: selectedTopics.map((topic) => ({
      keyword: topic.keyword,
      category: topic.category,
      intent: topic.intent,
    })),
  });

  return {
    topics: selectedTopics,
    queueState: workingQueueState,
    historyItems,
    plan,
  };
}

if (require.main === module) {
  const selection = process.argv.includes("--batch") ? selectTopicBatch() : selectNextTopic();
  const verbose = process.argv.includes("--verbose");
  const payload = process.argv.includes("--batch")
    ? verbose
      ? selection
      : {
          plan: selection.plan,
          topics: selection.topics,
        }
    : verbose
      ? selection
      : {
          topic: selection.topic,
          preferredCategory: selection.preferredCategory,
          rankedPreview: selection.rankedPreview,
        };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

module.exports = {
  chooseNextCategory,
  getDailyPublishingPlan,
  selectNextTopic,
  selectTopicBatch,
};
