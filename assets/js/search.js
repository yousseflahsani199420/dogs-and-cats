import { compareByDateDesc } from "./utils.js";

function tokenize(value = "") {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);
}

function scoreMatch(item, queryTokens = [], rawQuery = "") {
  if (!queryTokens.length) {
    return item.boost || 0;
  }

  const title = (item.title || "").toLowerCase();
  const keyword = (item.keyword || "").toLowerCase();
  const excerpt = (item.excerpt || "").toLowerCase();
  const tags = (item.tags || []).map((tag) => tag.toLowerCase());
  const headings = (item.headings || []).map((heading) => heading.toLowerCase());
  const tokens = new Set(item.tokens || []);

  let score = item.boost || 0;

  queryTokens.forEach((token) => {
    if (title === rawQuery) {
      score += 30;
    }
    if (title.includes(rawQuery)) {
      score += 18;
    }
    if (title.includes(token)) {
      score += 9;
    }
    if (keyword.includes(token)) {
      score += 8;
    }
    if (tags.some((tag) => tag.includes(token))) {
      score += 7;
    }
    if (headings.some((heading) => heading.includes(token))) {
      score += 5;
    }
    if (excerpt.includes(token)) {
      score += 3;
    }
    if (tokens.has(token)) {
      score += 2;
    }
  });

  return score;
}

export function searchArticles(indexItems = [], filters = {}) {
  const query = (filters.query || "").trim().toLowerCase();
  const queryTokens = tokenize(query);
  const category = filters.category && filters.category !== "all" ? filters.category : "";
  const tag = filters.tag && filters.tag !== "all" ? filters.tag : "";
  const sort = filters.sort || "relevance";

  return indexItems
    .map((item) => ({
      ...item,
      matchScore: scoreMatch(item, queryTokens, query),
    }))
    .filter((item) => {
      if (category && item.category !== category) {
        return false;
      }
      if (tag && !(item.tags || []).includes(tag)) {
        return false;
      }
      if (!queryTokens.length) {
        return true;
      }
      return item.matchScore > 0;
    })
    .sort((left, right) => {
      if (sort === "newest") {
        return compareByDateDesc(left, right);
      }
      if (sort === "readingTime") {
        return (left.readingTime || 0) - (right.readingTime || 0) || compareByDateDesc(left, right);
      }
      return right.matchScore - left.matchScore || compareByDateDesc(left, right);
    });
}

export function collectTags(indexItems = []) {
  return Array.from(new Set(indexItems.flatMap((item) => item.tags || []).filter(Boolean)))
    .sort((left, right) => left.localeCompare(right));
}
