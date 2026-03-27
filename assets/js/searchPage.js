import { getAllArticles, getSearchIndex } from "./contentService.js";
import { registerServiceWorker } from "./pwa.js";
import { searchArticles, collectTags } from "./search.js";
import { injectSiteChrome, populateBreakingTicker, renderGridCard, renderSpotlightTag, showToast } from "./ui.js";
import { byId, getQueryParam } from "./utils.js";

async function initSearchPage() {
  injectSiteChrome();
  registerServiceWorker();

  const [articles, searchIndex] = await Promise.all([getAllArticles(), getSearchIndex()]);
  populateBreakingTicker(articles);

  const queryInput = byId("search-input");
  const categorySelect = byId("search-category");
  const tagSelect = byId("search-tag");
  const sortSelect = byId("search-sort");
  const meta = byId("search-meta");
  const resultsGrid = byId("search-results");
  const emptyState = byId("search-empty");

  const initialQuery = getQueryParam("q") || "";
  queryInput.value = initialQuery;

  collectTags(searchIndex).forEach((tag) => {
    const option = document.createElement("option");
    option.value = tag;
    option.textContent = tag;
    tagSelect.append(option);
  });

  let renderHandle = 0;

  function renderResults() {
    const filters = {
      query: queryInput.value,
      category: categorySelect.value,
      tag: tagSelect.value,
      sort: sortSelect.value,
    };
    const matches = searchArticles(searchIndex, filters);
    const resultArticles = matches
      .map((match) => articles.find((article) => article.slug === match.slug))
      .filter(Boolean);

    meta.textContent = `${resultArticles.length} article${resultArticles.length === 1 ? "" : "s"} found${filters.query ? ` for "${filters.query}"` : ""}`;
    resultsGrid.classList.remove("news-loading");
    resultsGrid.innerHTML = resultArticles.map(renderGridCard).join("");
    emptyState.classList.toggle("hidden", resultArticles.length > 0);

    if (!resultArticles.length) {
      emptyState.innerHTML = `
        <h2 class="section-title">No results yet</h2>
        <p class="muted-copy">Try a broader search term, remove a tag filter, or switch categories.</p>
        <div class="spotlight-tag-row">${collectTags(searchIndex).slice(0, 8).map((tag) => renderSpotlightTag(tag)).join("")}</div>
      `;
    }
  }

  function scheduleRender() {
    window.clearTimeout(renderHandle);
    renderHandle = window.setTimeout(renderResults, 80);
  }

  [queryInput, categorySelect, tagSelect, sortSelect].forEach((element) => {
    element.addEventListener("input", scheduleRender);
    element.addEventListener("change", renderResults);
  });

  renderResults();
}

initSearchPage().catch((error) => {
  console.error(error);
  showToast("Search failed to load.");
});
