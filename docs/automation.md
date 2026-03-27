# PetZone Automation Flow

## End-to-end pipeline

1. GitHub Actions starts on schedule or manual dispatch.
2. `npm run bootstrap` seeds content only when the repository is empty.
3. `scripts/select-topic.js` builds a balanced daily plan and selects `2` cat articles plus `2` dog articles by default.
4. `scripts/generate-article.js` calls the AI provider with server-side secrets and normalizes mixed-format output.
5. `scripts/validate-article.js` blocks malformed, duplicate, or weak content.
6. `scripts/update-indexes.js` rebuilds article feeds, search, sitemap, category pages, tag pages, and static article pages once after the whole batch is generated.
7. The workflow commits the updated files back to the repository.
8. GitHub Pages republishes automatically.

## Duplicate prevention

- `data/publishing-history.json` stores published keywords and dates.
- `data/topic-queue.json` keeps future topics ordered by priority.
- The selector publishes a balanced batch each day and avoids very similar consecutive topics within the same run.
- Validation checks fuzzy title similarity, content similarity, exact keyword reuse, and slug collisions before publish.

## Reliability

- AI requests use retry logic with exponential backoff for transient provider failures.
- Invalid JSON responses are retried automatically.
- File writes are atomic to reduce partial publish risk.
- The workflow always uploads the run log as an artifact for debugging.
- OpenRouter-compatible endpoints are supported through the same provider adapter.
- The scheduled batch is configurable through `DAILY_POSTS_PER_CATEGORY`, `DAILY_CATS_POSTS`, and `DAILY_DOGS_POSTS`.

## Pausing automation safely

- Disable the scheduled trigger in `.github/workflows/daily-post.yml`, or
- Temporarily remove `AI_API_KEY` from repository secrets to stop live generation.

## Cloudflare Workers migration path

The same logic can move later into a scheduled Worker:

- Keep the topic selection rules
- Keep the provider abstraction in `scripts/lib/ai-provider.js`
- Move file writes to a storage adapter such as GitHub API, R2, or KV
