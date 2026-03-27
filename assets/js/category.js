import { getAllArticles, getCategoryArticles, getCategoryDigest, getRequestedCategory } from "./contentService.js";
import { registerServiceWorker } from "./pwa.js";
import { setPageMeta } from "./seo.js";
import { injectSiteChrome, populateBreakingTicker, renderDenseHeadlineItem, renderGridCard, renderLeadCard, renderSidebarItem, renderTagPills, showToast } from "./ui.js";
import { byId, describeLoadError, scheduleIdleWork, showFallbackUI } from "./utils.js";

async function initCategoryPage() {
  injectSiteChrome();
  registerServiceWorker();

  console.log("Fetching category data...");
  const allArticles = await getAllArticles();
  const category = getRequestedCategory();
  const articles = getCategoryArticles(allArticles, category);
  const digest = await getCategoryDigest(category);
  console.log("Loaded data:", { category, articles, digest });
  if (!articles.length) {
    throw new Error(`No published ${category} articles are available yet.`);
  }
  const lead = articles[0];

  populateBreakingTicker(allArticles);
  setPageMeta({
    title: `${category === "dogs" ? "Dogs" : "Cats"} News and Guides | PetZone`,
    description:
      category === "dogs"
        ? "Browse dog news, food explainers, behavior guides, and training coverage on PetZone."
        : "Browse cat news, feeding explainers, behavior guides, and indoor care coverage on PetZone.",
    canonical: `/categories/${category}/`,
    keywords: [category, ...(digest?.topTags || []).slice(0, 6)],
  });

  byId("category-hero").classList.remove("news-loading");
  byId("category-hero").innerHTML = `
    <p class="eyebrow">Category</p>
    <h1 class="page-title">${category === "dogs" ? "Dog news and practical care guides" : "Cat news and practical care guides"}</h1>
    <p class="muted-copy">
      ${category === "dogs"
        ? "Training, food, exercise, health basics, and behavioral coverage for modern dog owners."
        : "Indoor care, feeding, kitten basics, health routines, and behavioral coverage for modern cat owners."}
    </p>
    <div class="category-summary-row">
      <span class="category-summary-pill">${articles.length} articles</span>
      <span class="category-summary-pill">${digest?.topTags?.length || 0} active topics</span>
      <span class="category-summary-pill">${digest?.featuredSlugs?.length || 0} featured pieces</span>
    </div>
    <div class="topic-chip-row">${renderTagPills((digest?.topTags || []).slice(0, 8))}</div>
  `;

  byId("category-lead-grid").classList.remove("news-loading");
  byId("category-lead-grid").innerHTML = `
    ${lead ? renderLeadCard(lead) : ""}
    <section class="headline-panel">
      <div class="section-header compact-header">
        <h2 class="section-title">Fast read</h2>
      </div>
      <div class="headline-stack">
        ${articles.slice(1, 6).map(renderDenseHeadlineItem).join("")}
      </div>
    </section>
  `;

  byId("category-grid").classList.remove("news-loading");
  byId("category-grid").innerHTML = articles.slice(1, 9).map(renderGridCard).join("");
  scheduleIdleWork(() => {
    byId("category-sidebar-list").classList.remove("news-loading");
    byId("category-sidebar-list").innerHTML = articles.slice(0, 5).map(renderSidebarItem).join("");

    byId("category-headline-stream").classList.remove("news-loading");
    byId("category-headline-stream").innerHTML = articles.slice(5, 11).map(renderDenseHeadlineItem).join("");
  });
}

initCategoryPage().catch((error) => {
  console.error("Category failed to load:", error);
  showFallbackUI([
    "category-hero",
    "category-lead-grid",
    "category-grid",
    "category-sidebar-list",
    "category-headline-stream",
  ], {
    title: "Category feed failed to load",
    description: describeLoadError(error, "category coverage"),
  });
  showToast("Category feed failed to load.");
});
