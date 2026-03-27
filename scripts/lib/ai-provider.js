const DEFAULT_BASE_URL = process.env.AI_BASE_URL || "https://api.openai.com/v1";
const DEFAULT_MODEL = process.env.AI_MODEL || (DEFAULT_BASE_URL.includes("openrouter.ai") ? "openrouter/free" : "gpt-4.1-mini");
const DEFAULT_TEMPERATURE = Number(process.env.AI_TEMPERATURE || "0.7");
const DEFAULT_MAX_TOKENS = Number(process.env.AI_MAX_TOKENS || "4000");
const DEFAULT_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || "45000");
const DEFAULT_RETRY_ATTEMPTS = Number(process.env.AI_RETRY_ATTEMPTS || "3");
const { endGroup, info, startGroup, warn } = require("./logger");

function requireConfig() {
  if (!process.env.AI_API_KEY) {
    throw new Error("Missing AI_API_KEY. Configure GitHub Actions secrets or local environment variables before live generation.");
  }
  return {
    apiKey: process.env.AI_API_KEY,
    baseUrl: DEFAULT_BASE_URL.replace(/\/$/, ""),
    model: DEFAULT_MODEL,
    temperature: DEFAULT_TEMPERATURE,
    maxTokens: DEFAULT_MAX_TOKENS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    retryAttempts: DEFAULT_RETRY_ATTEMPTS,
    httpReferer: process.env.AI_HTTP_REFERER || process.env.SITE_BASE_URL || "https://petzone.local",
    appTitle: process.env.AI_APP_TITLE || "PetZone",
  };
}

function extractJsonBlock(text = "") {
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    return objectMatch[0];
  }
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    return arrayMatch[0];
  }
  throw new Error("AI response did not contain JSON.");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(statusCode, error) {
  if (error?.name === "AbortError") {
    return true;
  }
  if (!statusCode && error) {
    return true;
  }
  return [408, 409, 425, 429, 500, 502, 503, 504].includes(statusCode);
}

function backoffDelay(attempt) {
  const base = 1200 * Math.pow(2, attempt - 1);
  const jitter = Math.floor(Math.random() * 450);
  return Math.min(base + jitter, 12000);
}

async function callChat(messages, options = {}) {
  const config = requireConfig();
  const retryAttempts = options.retryAttempts || config.retryAttempts;
  const model = options.model || config.model;
  let lastError = null;
  const isOpenRouter = config.baseUrl.includes("openrouter.ai");

  startGroup(`AI provider request: ${model}`);

  for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || config.timeoutMs);
    const startedAt = Date.now();

    try {
      info(`Attempt ${attempt}/${retryAttempts}`);
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
          ...(isOpenRouter
            ? {
                "HTTP-Referer": config.httpReferer,
                "X-OpenRouter-Title": config.appTitle,
              }
            : {}),
        },
        body: JSON.stringify({
          model,
          temperature: options.temperature ?? config.temperature,
          max_tokens: options.maxTokens || config.maxTokens,
          messages,
        }),
        signal: controller.signal,
      });

      const elapsedMs = Date.now() - startedAt;
      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        const providerError = new Error(`AI provider error ${response.status}: ${errorText}`);
        providerError.statusCode = response.status;
        providerError.elapsedMs = elapsedMs;
        throw providerError;
      }

      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("AI provider returned an empty completion.");
      }
      info(`Attempt ${attempt} succeeded in ${elapsedMs}ms`);
      endGroup();
      return content;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      const retryable = shouldRetry(error.statusCode, error);
      warn(`AI request failed on attempt ${attempt}/${retryAttempts}${retryable ? " and will be retried" : ""}`, {
        message: error.message,
        statusCode: error.statusCode || null,
      });
      if (!retryable || attempt === retryAttempts) {
        break;
      }
      await sleep(backoffDelay(attempt));
    }
  }

  endGroup();
  throw lastError || new Error("AI provider request failed.");
}

async function callJson(messages, options = {}) {
  const attempts = options.jsonAttempts || 2;
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const content = await callChat(messages, options);
      return JSON.parse(extractJsonBlock(content));
    } catch (error) {
      lastError = error;
      if (attempt === attempts) {
        break;
      }
      warn(`AI JSON parsing failed on attempt ${attempt}/${attempts}; retrying request.`);
    }
  }
  throw lastError;
}

async function generateTitles(topic) {
  return callJson(
    [
      {
        role: "system",
        content:
          "You are an SEO editor for a pet news website. Return raw JSON only in the shape {\"titles\":[\"...\"]}.",
      },
      {
        role: "user",
        content: `Create 5 SEO-friendly article titles for the topic "${topic.keyword}" in category "${topic.category}". Use a trustworthy editorial tone.`,
      },
    ],
    { maxTokens: 600 }
  );
}

async function generateOutline(topic, keyword) {
  return callJson(
    [
      {
        role: "system",
        content:
          "You are a senior content strategist. Return raw JSON only in the shape {\"h1\":\"...\",\"sections\":[{\"h2\":\"...\",\"h3\":[\"...\",\"...\"]}]}.",
      },
      {
        role: "user",
        content: `Build an outline for a pet article about "${keyword}" for the ${topic.category} category.`,
      },
    ],
    { maxTokens: 900 }
  );
}

async function generateArticle(params) {
  return callJson(
    [
      {
        role: "system",
        content:
          "You write production-ready pet editorial content. Return raw JSON only with keys title, excerpt, contentHtml, keyTakeaways, internalLinkSuggestions. contentHtml must be clean semantic HTML with h2, h3, p, ul, li and no markdown.",
      },
      {
        role: "user",
        content: JSON.stringify({
          instruction:
            "Write a 1100-1400 word article for a static pets news website. Keep claims practical and avoid making veterinary diagnoses.",
          params,
        }),
      },
    ],
    { maxTokens: 3200 }
  );
}

async function generateFaq(params) {
  return callJson(
    [
      {
        role: "system",
        content:
          "Return raw JSON only in the shape {\"faqItems\":[{\"question\":\"...\",\"answer\":\"...\"}]}. Answers should be concise and SEO-friendly.",
      },
      {
        role: "user",
        content: `Create 4 FAQ items for this article context: ${JSON.stringify(params)}`,
      },
    ],
    { maxTokens: 900 }
  );
}

async function generateSeoMeta(params) {
  return callJson(
    [
      {
        role: "system",
        content:
          "Return raw JSON only in the shape {\"seoTitle\":\"...\",\"seoDescription\":\"...\",\"seoKeywords\":[\"...\"],\"ogDescription\":\"...\"}.",
      },
      {
        role: "user",
        content: `Generate metadata for this pet article: ${JSON.stringify(params)}`,
      },
    ],
    { maxTokens: 700 }
  );
}

async function generateTags(params) {
  return callJson(
    [
      {
        role: "system",
        content: "Return raw JSON only in the shape {\"tags\":[\"...\"]}. Provide 6 concise SEO-oriented tags.",
      },
      {
        role: "user",
        content: `Suggest tags for this article: ${JSON.stringify(params)}`,
      },
    ],
    { maxTokens: 350 }
  );
}

async function scoreArticle(params) {
  return callJson(
    [
      {
        role: "system",
        content:
          "Return raw JSON only in the shape {\"seoScore\":0,\"readabilityScore\":0,\"structureScore\":0,\"internalLinkScore\":0,\"notes\":[\"...\"]}. Scores must be integers from 0 to 100.",
      },
      {
        role: "user",
        content: `Evaluate this pet article draft for editorial publishing: ${JSON.stringify(params)}`,
      },
    ],
    { maxTokens: 450 }
  );
}

module.exports = {
  generateTitles,
  generateOutline,
  generateArticle,
  generateFaq,
  generateSeoMeta,
  generateTags,
  scoreArticle,
};
