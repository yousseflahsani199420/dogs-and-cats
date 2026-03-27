import { PETZONE_CONFIG } from "./config.js";
import { saveNewsletterSubscriber } from "./storageService.js";
import {
  articlePath,
  assetPath,
  cancelIdleWork,
  categoryPath,
  escapeHtml,
  formatDate,
  getCurrentDateLabel,
  shareContent,
  sitePath,
  tagPath,
} from "./utils.js";

const IMAGE_WIDTH = 1200;
const IMAGE_HEIGHT = 675;

function activeLinkClass(href) {
  const normalizedCurrent = window.location.pathname.replace(/\/index\.html$/, "/");
  const normalizedTarget = new URL(sitePath(href), window.location.origin).pathname.replace(/\/index\.html$/, "/");
  return normalizedCurrent === normalizedTarget ? "is-active" : "";
}

function renderArticleBadges(article) {
  const badges = [];
  if (article.featured) {
    badges.push('<span class="meta-badge featured">Featured</span>');
  }
  if (article.trending) {
    badges.push('<span class="meta-badge trending">Trending</span>');
  }
  return badges.join("");
}

export function injectSiteChrome() {
  const headerTarget = document.querySelector("[data-site-header]");
  const footerTarget = document.querySelector("[data-site-footer]");
  const main = document.querySelector("main");

  if (main && !main.id) {
    main.id = "page-content";
  }

  if (headerTarget) {
    headerTarget.innerHTML = `
      <a class="skip-link" href="#page-content">Skip to content</a>
      <section class="news-topline">
        <div class="site-shell news-topline-inner">
          <span>${getCurrentDateLabel()}</span>
          <span>Fresh cat and dog coverage, updated daily</span>
        </div>
      </section>
      <header class="main-header">
        <div class="site-shell main-header-inner">
          <a href="${sitePath("index.html")}" class="brand-logo" aria-label="PetZone home">
            <img src="${assetPath("assets/images/logo-full.svg")}" alt="PetZone" class="brand-logo-image" width="190" height="60" />
          </a>
          <nav class="nav-links" aria-label="Primary navigation">
            ${PETZONE_CONFIG.navLinks
              .map((link) => `<a href="${sitePath(link.href)}" class="nav-link ${activeLinkClass(link.href)}">${link.label}</a>`)
              .join("")}
          </nav>
          <div class="header-actions">
            <button
              id="mobile-nav-toggle"
              class="mobile-nav-toggle"
              type="button"
              aria-expanded="false"
              aria-controls="mobile-menu"
              aria-label="Toggle navigation"
            >
              <span class="hamburger-lines" aria-hidden="true">
                <span></span>
                <span></span>
                <span></span>
              </span>
              <span class="mobile-nav-label">Menu</span>
            </button>
          </div>
        </div>
        <div id="mobile-menu-overlay" class="mobile-menu-overlay" hidden></div>
        <div id="mobile-menu" class="mobile-menu" hidden>
          <div class="site-shell mobile-menu-inner">
            ${PETZONE_CONFIG.navLinks.map((link) => `<a href="${sitePath(link.href)}" class="mobile-link">${link.label}</a>`).join("")}
          </div>
        </div>
      </header>
    `;
  }

  if (footerTarget) {
    footerTarget.innerHTML = `
      <footer class="site-footer">
        <div class="site-shell footer-main">
          <div>
            <p class="eyebrow">PetZone</p>
            <h2 class="section-title small-title">Cats and dogs, covered like a real newsroom.</h2>
            <p class="muted-copy">
              PetZone combines dense editorial coverage, fast static pages, and a file-based publishing workflow ready for AI automation.
            </p>
          </div>
        <div class="footer-link-grid">
            <a href="${sitePath("about.html")}">About</a>
            <a href="${sitePath("contact.html")}">Contact</a>
            <a href="${sitePath("privacy.html")}">Privacy</a>
            <a href="${sitePath("terms.html")}">Terms</a>
            <a href="${sitePath("faq.html")}">FAQ</a>
            <a href="${sitePath("admin.html")}">Admin</a>
        </div>
      </div>
    </footer>
  `;
  }

  bindChromeInteractions();
  bindNewsletterForms();
}

export function bindChromeInteractions() {
  const toggle = document.getElementById("mobile-nav-toggle");
  const mobileMenu = document.getElementById("mobile-menu");
  const overlay = document.getElementById("mobile-menu-overlay");
  if (!toggle || !mobileMenu || !overlay) {
    return;
  }

  const closeMenu = () => {
    mobileMenu.hidden = true;
    overlay.hidden = true;
    mobileMenu.classList.remove("is-open");
    overlay.classList.remove("is-open");
    document.body.classList.remove("nav-open");
    toggle.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  };

  const openMenu = () => {
    mobileMenu.hidden = false;
    overlay.hidden = false;
    mobileMenu.classList.add("is-open");
    overlay.classList.add("is-open");
    document.body.classList.add("nav-open");
    toggle.classList.add("is-open");
    toggle.setAttribute("aria-expanded", "true");
  };

  toggle.addEventListener("click", () => {
    const isOpen = mobileMenu.hidden;
    if (isOpen) {
      openMenu();
      return;
    }
    closeMenu();
  });

  overlay.addEventListener("click", closeMenu);
  mobileMenu.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      closeMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 820) {
      closeMenu();
    }
  });
}

function buildResponsiveImage({
  src,
  alt,
  loading = "lazy",
  fetchpriority = "auto",
  sizes = "(max-width: 767px) 100vw, 360px",
}) {
  const resolvedSrc = assetPath(src);
  return `
    <img
      src="${resolvedSrc}"
      alt="${escapeHtml(alt)}"
      loading="${loading}"
      decoding="async"
      width="${IMAGE_WIDTH}"
      height="${IMAGE_HEIGHT}"
      sizes="${sizes}"
      onerror="this.onerror=null;this.src='${assetPath("assets/images/placeholder-pet.svg")}';"
      ${fetchpriority !== "auto" ? `fetchpriority="${fetchpriority}"` : ""}
    />
  `;
}

function renderNewsMedia(article, options = {}) {
  return `
    <a href="${articlePath(article.slug)}" class="media-link news-media">
      ${buildResponsiveImage({
        src: article.featuredImage,
        alt: article.imageAlt || article.title,
        ...options,
      })}
    </a>
  `;
}

function scheduleToastRemoval(toast) {
  let removalHandle = 0;
  const removeToast = () => {
    cancelIdleWork(removalHandle);
    toast.remove();
  };
  removalHandle = window.setTimeout(removeToast, 3200);
  toast.addEventListener("click", removeToast, { once: true });
}

export function showToast(message) {
  const root = document.getElementById("toast-root");
  if (!root) {
    return;
  }
  const toast = document.createElement("div");
  toast.className = "toast-item";
  toast.textContent = message;
  root.append(toast);
  scheduleToastRemoval(toast);
}

export function renderLeadCard(article) {
  return `
    <article class="lead-card news-card">
      ${renderNewsMedia(article, {
        loading: "eager",
        fetchpriority: "high",
        sizes: "(max-width: 767px) 100vw, (max-width: 1100px) 92vw, 820px",
      })}
      <div class="news-card-body">
        <div class="card-meta-row">
          <a class="category-pill ${article.category}" href="${categoryPath(article.category)}">${escapeHtml(article.categoryLabel || article.category)}</a>
          <span>${formatDate(article.publishDate)}</span>
          <span>${article.readingTime} min read</span>
          ${renderArticleBadges(article)}
        </div>
        <a href="${articlePath(article.slug)}" class="headline-link">${escapeHtml(article.title)}</a>
        <p class="card-excerpt">${escapeHtml(article.excerpt)}</p>
      </div>
    </article>
  `;
}

export function renderCompactCard(article) {
  return `
    <article class="compact-card news-card">
      ${renderNewsMedia(article, {
        sizes: "(max-width: 767px) 100vw, (max-width: 1100px) 44vw, 260px",
      })}
      <div class="news-card-body">
        <a href="${articlePath(article.slug)}" class="headline-link small-headline">${escapeHtml(article.title)}</a>
        <div class="card-meta-row compact-meta-row">
          <a class="category-pill ${article.category}" href="${categoryPath(article.category)}">${escapeHtml(article.categoryLabel || article.category)}</a>
          <span>${formatDate(article.publishDate)}</span>
          <span>${article.readingTime} min</span>
        </div>
      </div>
    </article>
  `;
}

export function renderGridCard(article) {
  return `
    <article class="grid-card news-card">
      ${renderNewsMedia(article, {
        sizes: "(max-width: 767px) 100vw, (max-width: 1100px) 46vw, 360px",
      })}
      <div class="news-card-body">
        <div class="card-meta-row">
          <a class="category-pill ${article.category}" href="${categoryPath(article.category)}">${escapeHtml(article.categoryLabel || article.category)}</a>
          <span>${formatDate(article.publishDate)}</span>
          <span>${article.readingTime} min</span>
          ${renderArticleBadges(article)}
        </div>
        <a href="${articlePath(article.slug)}" class="headline-link medium-headline">${escapeHtml(article.title)}</a>
        <p class="card-excerpt">${escapeHtml(article.excerpt)}</p>
      </div>
    </article>
  `;
}

export function renderListCard(article) {
  return `
    <article class="list-card news-card">
      ${renderNewsMedia(article, {
        sizes: "(max-width: 767px) 96px, 104px",
      })}
      <div class="news-card-body">
        <a href="${articlePath(article.slug)}" class="headline-link list-headline">${escapeHtml(article.title)}</a>
        <div class="card-meta-row compact-meta-row">
          <a class="category-pill ${article.category}" href="${categoryPath(article.category)}">${escapeHtml(article.categoryLabel || article.category)}</a>
          <span>${formatDate(article.publishDate)}</span>
          <span>${article.readingTime} min read</span>
        </div>
      </div>
    </article>
  `;
}

export function bindNewsletterForms() {
  document.querySelectorAll("[data-newsletter-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const email = data.get("email")?.toString().trim().toLowerCase();
      if (!email) {
        return;
      }
      saveNewsletterSubscriber(email);
      form.reset();
      showToast("Email saved locally. Connect your email provider later to make it live.");
    });
  });
}

export function populateBreakingTicker(articles = []) {
  const ticker = document.getElementById("breaking-ticker");
  if (!ticker || !articles.length) {
    return;
  }
  ticker.textContent = articles
    .slice(0, 6)
    .map((article) => article.title)
    .join(" | ");
}

export function renderDenseHeadlineItem(article, index = 0) {
  return `
    <article class="headline-row">
      <span class="headline-rank">${String(index + 1).padStart(2, "0")}</span>
      <div class="headline-row-body">
        <a href="${articlePath(article.slug)}" class="headline-row-link">${escapeHtml(article.title)}</a>
        <div class="card-meta-row compact-meta-row">
          <a class="category-pill ${article.category}" href="${categoryPath(article.category)}">${escapeHtml(article.categoryLabel || article.category)}</a>
          <span>${formatDate(article.publishDate)}</span>
          <span>${article.readingTime} min</span>
        </div>
      </div>
    </article>
  `;
}

export function renderSidebarItem(article, index) {
  return `
    <article class="sidebar-item">
      <span class="sidebar-rank">${String(index + 1).padStart(2, "0")}</span>
      <div>
        <a href="${articlePath(article.slug)}" class="sidebar-link">${escapeHtml(article.title)}</a>
        <p class="sidebar-meta">${formatDate(article.publishDate)} - ${article.readingTime} min</p>
      </div>
    </article>
  `;
}

export function renderTagPills(tags = []) {
  return tags
    .map((tag) => `<a href="${tagPath(tag)}" class="tag-pill">${escapeHtml(tag)}</a>`)
    .join("");
}

export function renderSpotlightTag(tag) {
  return `<a href="${tagPath(tag.label || tag)}" class="spotlight-tag">${escapeHtml(tag.label || tag)}</a>`;
}

export function renderBreadcrumbs(items = []) {
  return `
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      ${items
        .map((item, index) =>
          item.href
            ? `<a href="${item.href}">${escapeHtml(item.label)}</a>${index < items.length - 1 ? "<span>/</span>" : ""}`
            : `<span>${escapeHtml(item.label)}</span>`
        )
        .join("")}
    </nav>
  `;
}

export function renderRelatedArticles(articles = []) {
  if (!articles.length) {
    return "";
  }
  return `
    <section class="related-posts">
      <div class="section-header">
        <h2 class="section-title">Related coverage</h2>
      </div>
      <div class="news-grid">
        ${articles.map(renderGridCard).join("")}
      </div>
    </section>
  `;
}

export function wireShareButton(button, { url, title = "", text = "" } = {}) {
  if (!button) {
    return;
  }
  button.addEventListener("click", async () => {
    const result = await shareContent({ url, title, text });
    if (result === "shared") {
      showToast("Article shared.");
      return;
    }
    if (result === "copied") {
      showToast("Article link copied.");
    }
  });
}
