const { buildTopicQueue, getKeywordRecords } = require("./lib/seed-data");
const { loadPublishingHistory, loadTopicQueue, saveTopicQueue } = require("./lib/content-utils");
const { info } = require("./lib/logger");

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

function reconcileQueue(queueItems = [], historyItems = []) {
  const canonicalRecords = [...getKeywordRecords().cats.highVolume, ...getKeywordRecords().cats.longTail, ...getKeywordRecords().dogs.highVolume, ...getKeywordRecords().dogs.longTail];
  const canonicalMap = new Map(canonicalRecords.map((record) => [record.keyword.toLowerCase(), record]));
  const usedKeywords = new Set(historyItems.map((item) => item.keyword.toLowerCase()));
  const deduped = [];
  const seen = new Set();

  queueItems.forEach((item) => {
    const key = item.keyword.toLowerCase();
    if (seen.has(key) || usedKeywords.has(key)) {
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
    if (!seen.has(key) && !usedKeywords.has(key)) {
      deduped.push(record);
      seen.add(key);
    }
  });

  return deduped;
}

function selectNextTopic() {
  const history = loadPublishingHistory();
  const preferredCategory = chooseNextCategory(history.items);
  let queueState = loadTopicQueue();

  if (!queueState.queue.length) {
    queueState = {
      updatedAt: new Date().toISOString(),
      queue: buildTopicQueue(history.items.map((item) => item.keyword)),
    };
    saveTopicQueue(queueState);
  } else {
    const reconciledQueue = reconcileQueue(queueState.queue, history.items);
    if (JSON.stringify(reconciledQueue) !== JSON.stringify(queueState.queue)) {
      queueState = {
        updatedAt: new Date().toISOString(),
        queue: reconciledQueue,
      };
      saveTopicQueue(queueState);
    }
  }

  const ranked = queueState.queue
    .map((topic) => ({
      ...topic,
      score: scoreTopic(topic, history.items, preferredCategory),
    }))
    .sort((left, right) => right.score - left.score);

  const topic = ranked[0];

  if (!topic) {
    throw new Error("No topic could be selected from the queue.");
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

if (require.main === module) {
  const selection = selectNextTopic();
  const verbose = process.argv.includes("--verbose");
  const payload = verbose
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
  selectNextTopic,
};
