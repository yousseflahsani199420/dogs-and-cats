import { getAllArticles, getCategoryArticles, getSiteFeeds } from "./contentService.js";
import { registerServiceWorker } from "./pwa.js";
import { replaceJsonLd } from "./seo.js";
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
import { byId, canonicalUrl, describeLoadError, escapeHtml, scheduleIdleWork, showFallbackUI } from "./utils.js";

const HERO_ROTATE_INTERVAL_MS = 10000;

function uniqueArticles(items = []) {
  const seen = new Set();
  return items.filter((article) => {
    if (!article?.slug || seen.has(article.slug)) {
      return false;
    }
    seen.add(article.slug);
    return true;
  });
}

function getHeroArticles(activeIndex, heroArticles) {
  const leadArticle = heroArticles[activeIndex] || heroArticles[0];
  const sideArticles = [];

  for (let offset = 1; offset < heroArticles.length && sideArticles.length < 4; offset += 1) {
    sideArticles.push(heroArticles[(activeIndex + offset) % heroArticles.length]);
  }

  return { leadArticle, sideArticles };
}

function renderHeroGrid(heroGrid, heroArticles, activeIndex) {
  const { leadArticle, sideArticles } = getHeroArticles(activeIndex, heroArticles);
  heroGrid.classList.remove("news-loading");
  heroGrid.innerHTML = `
    <div class="hero-carousel-shell">
      <div class="hero-carousel-frame">
        ${renderLeadCard(leadArticle)}
      </div>
      ${
        heroArticles.length > 1
          ? `
            <div class="hero-carousel-controls" aria-label="Featured story navigation">
              ${heroArticles
                .map(
                  (article, index) => `
                    <button
                      type="button"
                      class="hero-carousel-dot${index === activeIndex ? " is-active" : ""}"
                      data-hero-index="${index}"
                      aria-label="Show featured story ${index + 1}: ${escapeHtml(article.title)}"
                      aria-pressed="${index === activeIndex ? "true" : "false"}"
                    ></button>
                  `
                )
                .join("")}
            </div>
          `
          : ""
      }
    </div>
    <div class="hero-side-grid">${sideArticles.map(renderCompactCard).join("")}</div>
  `;
}

function setupHeroRotation(heroGrid, heroArticles) {
  if (!heroGrid || !heroArticles.length) {
    return;
  }

  let activeIndex = 0;
  let intervalId = 0;
  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  const stopRotation = () => {
    if (!intervalId) {
      return;
    }
    window.clearInterval(intervalId);
    intervalId = 0;
  };

  const goTo = (nextIndex) => {
    activeIndex = (nextIndex + heroArticles.length) % heroArticles.length;
    renderHeroGrid(heroGrid, heroArticles, activeIndex);
  };

  const startRotation = () => {
    stopRotation();
    if (prefersReducedMotion || heroArticles.length < 2) {
      return;
    }
    intervalId = window.setInterval(() => {
      goTo(activeIndex + 1);
    }, HERO_ROTATE_INTERVAL_MS);
  };

  renderHeroGrid(heroGrid, heroArticles, activeIndex);

  heroGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-hero-index]");
    if (!button) {
      return;
    }
    goTo(Number(button.dataset.heroIndex) || 0);
    startRotation();
  });

  heroGrid.addEventListener("mouseenter", stopRotation);
  heroGrid.addEventListener("mouseleave", startRotation);
  heroGrid.addEventListener("focusin", stopRotation);
  heroGrid.addEventListener("focusout", (event) => {
    if (event.relatedTarget && heroGrid.contains(event.relatedTarget)) {
      return;
    }
    startRotation();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopRotation();
      return;
    }
    startRotation();
  });

  startRotation();
}

async function initHomePage() {
  injectSiteChrome();
  registerServiceWorker();

  console.log("Fetching articles for homepage...");
  const articles = await getAllArticles();
  const siteFeeds = await getSiteFeeds();
  console.log("Loaded data:", { articles, siteFeeds });
  if (!articles.length) {
    throw new Error("The homepage feed is empty.");
  }
  const bySlug = new Map(articles.map((article) => [article.slug, article]));
  const resolveMany = (slugs = []) => slugs.map((slug) => bySlug.get(slug)).filter(Boolean);
  populateBreakingTicker(articles);

  const lead = bySlug.get(siteFeeds.hero?.lead) || articles[0];
  const featuredArticles = resolveMany(siteFeeds.hero?.side);
  const latestFeedArticles = resolveMany(siteFeeds.latest);
  const resolvedTrending = resolveMany(siteFeeds.trending);
  const resolvedHeadlines = resolveMany(siteFeeds.headlines);
  const resolvedCats = resolveMany(siteFeeds.cats);
  const resolvedDogs = resolveMany(siteFeeds.dogs);
  const resolvedPopular = resolveMany(siteFeeds.popular);
  const heroArticles = uniqueArticles([lead, ...featuredArticles, ...latestFeedArticles, ...articles]).slice(0, 5);
  const trendingArticles = (resolvedTrending.length ? resolvedTrending : articles.filter((article) => article.trending || article.featured)).slice(0, 8);
  const latestArticles = (latestFeedArticles.length ? latestFeedArticles : articles).slice(0, 8);
  const headlineArticles = (resolvedHeadlines.length ? resolvedHeadlines : articles).slice(0, 10);
  const catArticles = (resolvedCats.length ? resolvedCats : getCategoryArticles(articles, "cats")).slice(0, 6);
  const dogArticles = (resolvedDogs.length ? resolvedDogs : getCategoryArticles(articles, "dogs")).slice(0, 6);
  const popularArticles = (resolvedPopular.length ? resolvedPopular : uniqueArticles([...trendingArticles, ...articles])).slice(0, 8);

  replaceJsonLd("organization-jsonld", {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "PetZone",
    url: canonicalUrl("/"),
    logo: {
      "@type": "ImageObject",
      url: canonicalUrl("/assets/images/logo-mark.svg"),
      width: 512,
      height: 512,
    },
  });

  replaceJsonLd("website-jsonld", {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "PetZone",
    url: canonicalUrl("/"),
    potentialAction: {
      "@type": "SearchAction",
      target: `${canonicalUrl("/search.html")}?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  });

  replaceJsonLd("homepage-jsonld", {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "PetZone News | Cats & Dogs Daily",
    description: "Breaking pet care news, category hubs, and practical cat and dog guides from PetZone.",
    url: canonicalUrl("/"),
    mainEntity: {
      "@type": "ItemList",
      itemListElement: latestArticles.slice(0, 10).map((article, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: canonicalUrl(`/posts/${article.slug}/`),
        name: article.title,
      })),
    },
  });

  const heroGrid = byId("home-hero-grid");
  setupHeroRotation(heroGrid, heroArticles);

  byId("latest-article-grid").innerHTML = latestArticles.map(renderGridCard).join("");
  byId("latest-article-grid").classList.remove("news-loading");
  scheduleIdleWork(() => {
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
  });
}

initHomePage().catch((error) => {
  console.error("Homepage failed to load:", error);
  const ticker = byId("breaking-ticker");
  if (ticker) {
    ticker.textContent = "Homepage feed unavailable. Retrying is safe.";
  }
  showFallbackUI([
    "home-hero-grid",
    "latest-article-grid",
    "home-headline-stream",
    "cats-category-block",
    "dogs-category-block",
    "trending-list",
    "popular-list",
    "home-spotlight-tags",
  ], {
    title: "Homepage failed to load",
    description: describeLoadError(error, "homepage stories"),
  });
});
