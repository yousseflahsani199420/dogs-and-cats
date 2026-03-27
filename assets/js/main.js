import { getAllArticles, getCategoryArticles, getSiteFeeds } from "./contentService.js";
import { registerServiceWorker } from "./pwa.js";
import {
  injectSiteChrome,
  populateBreakingTicker,
  renderCompactCard,
  renderDenseHeadlineItem,
  renderGridCard,
  renderLeadCard,
  renderListCard,
  renderSidebarItem,
  renderSpotlightTag,
} from "./ui.js";
import { byId } from "./utils.js";

async function initHomePage() {
  injectSiteChrome();
  registerServiceWorker();

  const [articles, siteFeeds] = await Promise.all([getAllArticles(), getSiteFeeds()]);
  const bySlug = new Map(articles.map((article) => [article.slug, article]));
  const resolveMany = (slugs = []) => slugs.map((slug) => bySlug.get(slug)).filter(Boolean);
  populateBreakingTicker(articles);

  const lead = bySlug.get(siteFeeds.hero?.lead) || articles[0];
  const featuredArticles = resolveMany(siteFeeds.hero?.side);
  const trendingArticles = resolveMany(siteFeeds.trending);
  const latestArticles = resolveMany(siteFeeds.latest).slice(0, 8);
  const headlineArticles = resolveMany(siteFeeds.headlines).slice(0, 10);
  const catArticles = resolveMany(siteFeeds.cats).slice(0, 6);
  const dogArticles = resolveMany(siteFeeds.dogs).slice(0, 6);
  const popularArticles = resolveMany(siteFeeds.popular).slice(0, 8);

  const heroGrid = byId("home-hero-grid");
  if (heroGrid) {
    heroGrid.classList.remove("news-loading");
    heroGrid.innerHTML = `
      ${renderLeadCard(lead)}
      <div class="hero-side-grid">${featuredArticles.slice(0, 4).map(renderCompactCard).join("")}</div>
    `;
  }

  byId("latest-article-grid").innerHTML = latestArticles.map(renderGridCard).join("");
  byId("latest-article-grid").classList.remove("news-loading");

  byId("home-headline-stream").innerHTML = headlineArticles.map(renderDenseHeadlineItem).join("");
  byId("home-headline-stream").classList.remove("news-loading");

  byId("cats-category-block").innerHTML = (catArticles.length ? catArticles : getCategoryArticles(articles, "cats").slice(0, 6)).map(renderListCard).join("");
  byId("cats-category-block").classList.remove("news-loading");

  byId("dogs-category-block").innerHTML = (dogArticles.length ? dogArticles : getCategoryArticles(articles, "dogs").slice(0, 6)).map(renderListCard).join("");
  byId("dogs-category-block").classList.remove("news-loading");

  byId("trending-list").innerHTML = trendingArticles.slice(0, 8).map(renderSidebarItem).join("");
  byId("trending-list").classList.remove("news-loading");

  byId("popular-list").innerHTML = popularArticles.map(renderSidebarItem).join("");
  byId("popular-list").classList.remove("news-loading");

  byId("home-spotlight-tags").innerHTML = (siteFeeds.spotlightTags || []).map(renderSpotlightTag).join("");
  byId("home-spotlight-tags").classList.remove("news-loading");
}

initHomePage().catch((error) => {
  console.error(error);
});
