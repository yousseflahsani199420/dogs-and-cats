import { PETZONE_CONFIG } from "./config.js";
import { saveNewsletterSubscriber } from "./storageService.js";
import {
  articlePath,
  categoryPath,
  copyToClipboard,
  escapeHtml,
  formatDate,
  getCurrentDateLabel,
  tagPath,
} from "./utils.js";

function activeLinkClass(href) {
  return window.location.pathname.endsWith(href.replace(/^\.\//, "")) ? "is-active" : "";
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

  if (headerTarget) {
    headerTarget.innerHTML = `
      <section class="news-topline">
        <div class="site-shell news-topline-inner">
          <span>${getCurrentDateLabel()}</span>
          <span>Fresh cat and dog coverage, updated daily</span>
        </div>
      </section>
      <header class="main-header">
        <div class="site-shell main-header-inner">
          <a href="index.html" class="brand-logo">
            <img src="assets/images/logo-mark.svg" alt="PetZone logo" width="34" height="34" />
            <span>PetZone</span>
          </a>
          <nav class="nav-links" aria-label="Primary navigation">
            ${PETZONE_CONFIG.navLinks
              .map((link) => `<a href="${link.href}" class="nav-link ${activeLinkClass(link.href)}">${link.label}</a>`)
              .join("")}
          </nav>
          <div class="header-actions">
            <button id="mobile-nav-toggle" class="mobile-nav-toggle" type="button" aria-expanded="false" aria-label="Open navigation">
              Menu
            </button>
          </div>
        </div>
        <div id="mobile-menu" class="mobile-menu">
          <div class="site-shell mobile-menu-inner">
            ${PETZONE_CONFIG.navLinks.map((link) => `<a href="${link.href}" class="mobile-link">${link.label}</a>`).join("")}
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
            <a href="about.html">About</a>
            <a href="contact.html">Contact</a>
            <a href="privacy.html">Privacy</a>
            <a href="terms.html">Terms</a>
            <a href="faq.html">FAQ</a>
            <a href="admin.html">Admin</a>
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
  if (!toggle || !mobileMenu) {
    return;
  }
  toggle.addEventListener("click", () => {
    const isOpen = mobileMenu.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });
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

export function showToast(message) {
  const root = document.getElementById("toast-root");
  if (!root) {
    return;
  }
  const toast = document.createElement("div");
  toast.className = "toast-item";
  toast.textContent = message;
  root.append(toast);
  window.setTimeout(() => toast.remove(), 3200);
}

export function renderLeadCard(article) {
  return `
    <article class="lead-card news-card">
      <a href="${articlePath(article.slug)}" class="media-link">
        <img src="${article.featuredImage}" alt="${escapeHtml(article.imageAlt || article.title)}" loading="eager" />
      </a>
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
      <a href="${articlePath(article.slug)}" class="media-link">
        <img src="${article.featuredImage}" alt="${escapeHtml(article.imageAlt || article.title)}" loading="lazy" />
      </a>
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
      <a href="${articlePath(article.slug)}" class="media-link">
        <img src="${article.featuredImage}" alt="${escapeHtml(article.imageAlt || article.title)}" loading="lazy" />
      </a>
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
      <a href="${articlePath(article.slug)}" class="media-link">
        <img src="${article.featuredImage}" alt="${escapeHtml(article.imageAlt || article.title)}" loading="lazy" />
      </a>
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

export function wireCopyLink(button, url) {
  if (!button) {
    return;
  }
  button.addEventListener("click", async () => {
    await copyToClipboard(url);
    showToast("Article link copied.");
  });
}
