# PetZone Deployment

## GitHub Pages

1. Push the repository to GitHub.
2. In repository settings, enable GitHub Pages from the default branch and root directory.
3. Keep the public site static files in the repository root as they are now.
4. Run `npm run seed` locally before the first push if you want to regenerate starter content and indexes.

## Required GitHub Actions secrets

- `AI_API_KEY`
- `AI_BASE_URL`
- `AI_MODEL`
- `SITE_BASE_URL`

Set `SITE_BASE_URL` to your final Pages URL, for example `https://your-username.github.io/dogs-and-cats-blog`.

## Cron schedule

The workflow lives in `.github/workflows/daily-post.yml`.

- Default schedule: once per day
- Manual run: use the Actions tab and trigger `Daily PetZone Post`

## Switching AI providers

The automation layer uses `scripts/lib/ai-provider.js` and expects an OpenAI-compatible chat completions endpoint.

- OpenAI: use `https://api.openai.com/v1`
- OpenRouter: use `https://openrouter.ai/api/v1`
  - free router option: `openrouter/free`
  - free direct model option: append `:free` to a supported model ID
- Custom gateway: point `AI_BASE_URL` to your proxy or serverless adapter

For OpenRouter, you can also optionally set:

- `AI_HTTP_REFERER`
- `AI_APP_TITLE`

If those are not set, the automation uses `SITE_BASE_URL` and `PetZone` automatically.

## Running locally

- `npm run bootstrap`
- `npm run seed`
- `npm run build`
- `npm run publish:daily`

`npm run publish:daily` uses live AI only when `AI_API_KEY` is available. Without secrets it falls back to the deterministic seed generator for safe local testing.

## Recovery if generation fails

1. Open the latest failed workflow run.
2. Download the uploaded `daily-post-log` artifact.
3. Fix the prompt, provider config, or validation issue.
4. Re-run the workflow manually.
