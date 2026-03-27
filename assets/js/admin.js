import { PETZONE_CONFIG } from "./config.js";
import { clearArticleCache, getAllArticles, getArticleBySlug, getPublishingHistory, getTopicQueue } from "./contentService.js";
import { setPageMeta } from "./seo.js";
import { clearAdminSession, deleteAdminArticle, getAdminArticles, getAdminSession, isAdminLoggedIn, setAdminSession, upsertAdminArticle } from "./storageService.js";
import { showToast } from "./ui.js";
import { articlePath, byId, escapeHtml, estimateReadingTimeFromHtml, formatDate, slugify } from "./utils.js";

const state = {
  view: "overview",
  articles: [],
  history: { items: [] },
  queue: { queue: [] },
  filters: {
    query: "",
    status: "all",
    category: "all",
  },
  editing: null,
};

function hasValidAdminSession() {
  const session = getAdminSession();
  return Boolean(isAdminLoggedIn() && session?.username === PETZONE_CONFIG.demoAdmin.username);
}

async function sha256Hex(value = "") {
  const bytes = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function renderLoginGate() {
  const shell = document.querySelector(".admin-shell");
  shell.innerHTML = `
    <section class="admin-auth-shell">
      <article class="admin-auth-card">
        <img src="assets/images/logo-full.svg" alt="PetZone" class="admin-auth-logo" width="188" height="60" />
        <p class="eyebrow">Admin Login</p>
        <h1>Editorial Desk Access</h1>
        <p class="muted-copy">
          Sign in with the configured demo credentials to manage PetZone content locally.
        </p>
        <form id="admin-login-form" class="admin-auth-form">
          <div>
            <label class="input-label" for="admin-login-username">Username</label>
            <input id="admin-login-username" name="username" class="text-input" autocomplete="username" required />
          </div>
          <div>
            <label class="input-label" for="admin-login-password">Password</label>
            <input id="admin-login-password" name="password" type="password" class="text-input" autocomplete="current-password" required />
          </div>
          <p id="admin-login-error" class="admin-login-error hidden"></p>
          <button type="submit" class="button button-primary button-block">Log in</button>
        </form>
      </article>
    </section>
  `;

  byId("admin-login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const username = form.get("username")?.toString().trim() || "";
    const password = form.get("password")?.toString() || "";
    const errorNode = byId("admin-login-error");
    const hash = await sha256Hex(password);

    if (
      username === PETZONE_CONFIG.demoAdmin.username
      && hash === PETZONE_CONFIG.demoAdmin.passwordHash
    ) {
      setAdminSession({
        username,
        loginAt: new Date().toISOString(),
      });
      window.location.reload();
      return;
    }

    errorNode.textContent = "Incorrect username or password.";
    errorNode.classList.remove("hidden");
  });
}

function hydrateSessionUi() {
  const session = getAdminSession();
  const label = byId("admin-session-user");
  if (label && session?.username) {
    label.textContent = `Signed in as ${session.username}`;
    label.classList.remove("hidden");
  }
}

function emptyArticle() {
  const now = new Date().toISOString();
  return {
    id: `local-${Date.now()}`,
    title: "",
    slug: "",
    keyword: "",
    excerpt: "",
    content: "<p></p>",
    category: "cats",
    categoryLabel: "Cats",
    tags: ["pet care", "petzone", "editorial"],
    featuredImage: "assets/images/placeholder-pet.svg",
    imageAlt: "",
    author: {
      name: "PetZone Editorial Team",
      role: "Pet care newsroom",
      bio: "Local admin draft ready for export or manual review.",
    },
    publishDate: now,
    updatedDate: now,
    featured: false,
    trending: false,
    status: "draft",
    seoTitle: "",
    seoDescription: "",
    seoKeywords: [],
    faqItems: [
      { question: "", answer: "" },
      { question: "", answer: "" },
      { question: "", answer: "" },
    ],
    readingTime: 3,
    internalLinkSuggestions: [],
    source: "local-admin",
  };
}

function setView(view) {
  state.view = view;
  document.querySelectorAll(".admin-nav-link").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.adminView === view);
  });
  document.querySelectorAll(".admin-view").forEach((section) => {
    section.classList.toggle("hidden", section.id !== `admin-${view}-view`);
  });
  byId("admin-view-title").textContent =
    view === "seo" ? "SEO Assets" : view.charAt(0).toUpperCase() + view.slice(1);
}

function createStatusPill(status) {
  return `<span class="status-pill ${status}">${escapeHtml(status)}</span>`;
}

function wordCountFromHtml(html = "") {
  return html.replace(/<[^>]*>/g, " ").split(/\s+/).filter(Boolean).length;
}

function buildEditorChecklist(article) {
  const titleLength = (article.title || "").trim().length;
  const excerptLength = (article.excerpt || "").trim().length;
  const descriptionLength = (article.seoDescription || "").trim().length;
  const tagCount = (article.tags || []).length;
  const faqCount = (article.faqItems || []).filter((item) => item.question && item.answer).length;
  const words = wordCountFromHtml(article.content || "");
  return [
    {
      label: "Title length",
      value: `${titleLength} chars`,
      tone: titleLength >= 40 && titleLength <= 90 ? "good" : titleLength ? "warn" : "bad",
    },
    {
      label: "Excerpt",
      value: `${excerptLength} chars`,
      tone: excerptLength >= 110 && excerptLength <= 220 ? "good" : excerptLength ? "warn" : "bad",
    },
    {
      label: "SEO description",
      value: `${descriptionLength} chars`,
      tone: descriptionLength >= 135 && descriptionLength <= 165 ? "good" : descriptionLength ? "warn" : "bad",
    },
    {
      label: "Body length",
      value: `${words} words`,
      tone: words >= 900 ? "good" : words ? "warn" : "bad",
    },
    {
      label: "Tags",
      value: `${tagCount} tags`,
      tone: tagCount >= 3 ? "good" : tagCount ? "warn" : "bad",
    },
    {
      label: "FAQ items",
      value: `${faqCount} ready`,
      tone: faqCount >= 3 ? "good" : faqCount ? "warn" : "bad",
    },
  ];
}

function filteredArticles() {
  return state.articles.filter((article) => {
    const matchesQuery = !state.filters.query
      || [article.title, article.keyword, article.excerpt, ...(article.tags || [])]
        .join(" ")
        .toLowerCase()
        .includes(state.filters.query.toLowerCase());
    const matchesStatus = state.filters.status === "all" || article.status === state.filters.status;
    const matchesCategory = state.filters.category === "all" || article.category === state.filters.category;
    return matchesQuery && matchesStatus && matchesCategory;
  });
}

function renderOverview() {
  const published = state.articles.filter((article) => article.status === "published").length;
  const drafts = state.articles.filter((article) => article.status === "draft").length;
  const localItems = getAdminArticles().length;
  const trending = state.articles.filter((article) => article.trending).length;
  const featured = state.articles.filter((article) => article.featured).length;
  const recentHistory = state.history.items.slice(0, 6);

  byId("admin-overview-view").innerHTML = `
    <div class="admin-kpi-grid">
      <article class="dashboard-card">
        <div class="stat-label">Total articles</div>
        <div class="stat-value">${state.articles.length}</div>
      </article>
      <article class="dashboard-card">
        <div class="stat-label">Published</div>
        <div class="stat-value">${published}</div>
      </article>
      <article class="dashboard-card">
        <div class="stat-label">Drafts</div>
        <div class="stat-value">${drafts}</div>
      </article>
      <article class="dashboard-card">
        <div class="stat-label">Local overrides</div>
        <div class="stat-value">${localItems}</div>
      </article>
    </div>

    <div class="admin-summary-strip">
      <article class="admin-inline-stat">
        <span class="stat-label">Trending live</span>
        <strong>${trending}</strong>
      </article>
      <article class="admin-inline-stat">
        <span class="stat-label">Featured slots</span>
        <strong>${featured}</strong>
      </article>
      <article class="admin-inline-stat">
        <span class="stat-label">Queue depth</span>
        <strong>${state.queue.queue.length}</strong>
      </article>
    </div>

    <section class="admin-card table-panel">
      <div class="section-header">
        <h3 class="section-title">Recent publishing history</h3>
      </div>
      <div class="table-scroll">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Keyword</th>
              <th>Category</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            ${recentHistory
              .map(
                (item) => `
                  <tr>
                    <td>${formatDate(item.publishDate)}</td>
                    <td>${escapeHtml(item.keyword)}</td>
                    <td>${escapeHtml(item.category)}</td>
                    <td>${escapeHtml(item.source)}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>

    <section class="admin-card table-panel">
      <div class="section-header">
        <h3 class="section-title">Automation summary</h3>
      </div>
      <div class="automation-grid">
        <div>
          <p class="muted-copy">Trending articles in rotation</p>
          <strong>${trending}</strong>
        </div>
        <div>
          <p class="muted-copy">Queue depth</p>
          <strong>${state.queue.queue.length}</strong>
        </div>
        <div>
          <p class="muted-copy">Workflow file</p>
          <strong>${PETZONE_CONFIG.repoPointers.workflow}</strong>
        </div>
      </div>
    </section>
  `;
}

function renderArticlesView() {
  const rows = filteredArticles();
  byId("admin-articles-view").innerHTML = `
    <section class="table-panel table-toolbar">
      <div class="admin-summary-strip">
        <article class="admin-inline-stat">
          <span class="stat-label">Visible results</span>
          <strong>${rows.length}</strong>
        </article>
        <article class="admin-inline-stat">
          <span class="stat-label">Published in filter</span>
          <strong>${rows.filter((article) => article.status === "published").length}</strong>
        </article>
        <article class="admin-inline-stat">
          <span class="stat-label">Drafts in filter</span>
          <strong>${rows.filter((article) => article.status === "draft").length}</strong>
        </article>
      </div>
      <div class="field-grid three-col">
        <div>
          <label class="input-label" for="admin-filter-query">Search</label>
          <input id="admin-filter-query" class="text-input" value="${escapeHtml(state.filters.query)}" placeholder="Search title, keyword, tag..." />
        </div>
        <div>
          <label class="input-label" for="admin-filter-status">Status</label>
          <select id="admin-filter-status" class="select-input">
            <option value="all">All</option>
            <option value="published" ${state.filters.status === "published" ? "selected" : ""}>Published</option>
            <option value="draft" ${state.filters.status === "draft" ? "selected" : ""}>Draft</option>
          </select>
        </div>
        <div>
          <label class="input-label" for="admin-filter-category">Category</label>
          <select id="admin-filter-category" class="select-input">
            <option value="all">All</option>
            <option value="cats" ${state.filters.category === "cats" ? "selected" : ""}>Cats</option>
            <option value="dogs" ${state.filters.category === "dogs" ? "selected" : ""}>Dogs</option>
          </select>
        </div>
      </div>
    </section>

    <section class="table-panel">
      <div class="table-scroll">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Status</th>
              <th>Keyword</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (article) => `
                  <tr>
                    <td>
                      <strong>${escapeHtml(article.title)}</strong>
                      <div class="meta-copy">${escapeHtml(article.categoryLabel || article.category)} • ${article.readingTime || 0} min • ${article.tags?.length || 0} tags</div>
                    </td>
                    <td>${createStatusPill(article.status)}</td>
                    <td>${escapeHtml(article.keyword || "")}</td>
                    <td>${formatDate(article.updatedDate || article.publishDate)}</td>
                    <td>
                      <div class="button-row">
                        <button class="button button-secondary" type="button" data-admin-action="edit" data-article-id="${article.id}">Edit</button>
                        <button class="button button-secondary" type="button" data-admin-action="preview" data-article-slug="${article.slug}">Preview</button>
                        <button class="button button-secondary" type="button" data-admin-action="delete" data-article-id="${article.id}" data-article-slug="${article.slug}">Delete</button>
                      </div>
                    </td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;

  byId("admin-filter-query").addEventListener("input", (event) => {
    state.filters.query = event.target.value;
    renderArticlesView();
  });
  byId("admin-filter-status").addEventListener("change", (event) => {
    state.filters.status = event.target.value;
    renderArticlesView();
  });
  byId("admin-filter-category").addEventListener("change", (event) => {
    state.filters.category = event.target.value;
    renderArticlesView();
  });

  byId("admin-articles-view").querySelectorAll("[data-admin-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const articleId = button.dataset.articleId;
      const articleSlug = button.dataset.articleSlug;
      const article = state.articles.find((item) => item.id === articleId || item.slug === articleSlug);
      if (!article) {
        return;
      }

      if (button.dataset.adminAction === "edit") {
        const fullArticle = article.content ? article : await getArticleBySlug(article.slug);
        state.editing = structuredClone(fullArticle || article);
        setView("editor");
        renderEditor();
      }

      if (button.dataset.adminAction === "preview") {
        window.open(`article.html?slug=${article.slug}`, "_blank", "noopener");
      }

      if (button.dataset.adminAction === "delete") {
        upsertAdminArticle({
          id: article.id,
          slug: article.slug,
          deleted: true,
          updatedDate: new Date().toISOString(),
          publishDate: article.publishDate,
          category: article.category,
          title: article.title,
        });
        clearArticleCache();
        await refreshData();
        showToast("Article removed from the local admin view.");
      }
    });
  });
}

function editorFaqRows(article) {
  return article.faqItems
    .map(
      (item, index) => `
        <div class="field-grid two-col faq-row" data-faq-index="${index}">
          <div>
            <label class="input-label">Question</label>
            <input class="text-input faq-question" value="${escapeHtml(item.question || "")}" />
          </div>
          <div>
            <label class="input-label">Answer</label>
            <input class="text-input faq-answer" value="${escapeHtml(item.answer || "")}" />
          </div>
        </div>
      `
    )
    .join("");
}

function captureEditorState() {
  const form = byId("admin-editor-form");
  if (!form) {
    return state.editing || emptyArticle();
  }
  const data = new FormData(form);
  const faqItems = Array.from(form.querySelectorAll(".faq-row")).map((row) => ({
    question: row.querySelector(".faq-question").value.trim(),
    answer: row.querySelector(".faq-answer").value.trim(),
  })).filter((item) => item.question && item.answer);

  return {
    ...state.editing,
    title: data.get("title")?.toString().trim() || "",
    slug: data.get("slug")?.toString().trim() || "",
    keyword: data.get("keyword")?.toString().trim() || "",
    excerpt: data.get("excerpt")?.toString().trim() || "",
    content: data.get("content")?.toString().trim() || "",
    category: data.get("category")?.toString().trim() || "cats",
    categoryLabel: data.get("category")?.toString().trim() === "dogs" ? "Dogs" : "Cats",
    tags: (data.get("tags")?.toString().split(",") || []).map((tag) => tag.trim()).filter(Boolean),
    featuredImage: data.get("featuredImageCurrent")?.toString() || state.editing.featuredImage,
    imageAlt: data.get("imageAlt")?.toString().trim() || "",
    status: data.get("status")?.toString().trim() || "draft",
    featured: data.get("featured") === "on",
    trending: data.get("trending") === "on",
    seoTitle: data.get("seoTitle")?.toString().trim() || "",
    seoDescription: data.get("seoDescription")?.toString().trim() || "",
    seoKeywords: (data.get("seoKeywords")?.toString().split(",") || []).map((tag) => tag.trim()).filter(Boolean),
    faqItems,
    readingTime: estimateReadingTimeFromHtml(data.get("content")?.toString() || ""),
    updatedDate: new Date().toISOString(),
  };
}

function renderEditor() {
  const article = state.editing || emptyArticle();
  const readingTime = estimateReadingTimeFromHtml(article.content || "");
  const checklist = buildEditorChecklist(article);
  const wordCount = wordCountFromHtml(article.content || "");

  byId("admin-editor-view").innerHTML = `
    <div class="editor-layout">
      <form id="admin-editor-form" class="editor-panel">
        <input type="hidden" name="featuredImageCurrent" value="${escapeHtml(article.featuredImage || "")}" />
        <div class="editor-section">
          <div class="field-grid two-col">
            <div>
              <label class="input-label">Title</label>
              <input id="editor-title" name="title" class="text-input" value="${escapeHtml(article.title || "")}" required />
            </div>
            <div>
              <label class="input-label">Slug</label>
              <input id="editor-slug" name="slug" class="text-input" value="${escapeHtml(article.slug || "")}" required />
            </div>
          </div>
          <div class="field-grid three-col">
            <div>
              <label class="input-label">Keyword</label>
              <input name="keyword" class="text-input" value="${escapeHtml(article.keyword || "")}" />
            </div>
            <div>
              <label class="input-label">Category</label>
              <select name="category" class="select-input">
                <option value="cats" ${article.category === "cats" ? "selected" : ""}>Cats</option>
                <option value="dogs" ${article.category === "dogs" ? "selected" : ""}>Dogs</option>
              </select>
            </div>
            <div>
              <label class="input-label">Status</label>
              <select name="status" class="select-input">
                <option value="draft" ${article.status === "draft" ? "selected" : ""}>Draft</option>
                <option value="published" ${article.status === "published" ? "selected" : ""}>Published</option>
              </select>
            </div>
          </div>
          <div>
            <label class="input-label">Excerpt</label>
            <textarea name="excerpt" class="text-area">${escapeHtml(article.excerpt || "")}</textarea>
          </div>
          <div>
            <label class="input-label">Article HTML</label>
            <textarea id="editor-content" name="content" class="text-area code-area">${escapeHtml(article.content || "")}</textarea>
          </div>
          <div class="field-grid two-col">
            <div>
              <label class="input-label">Tags</label>
              <input name="tags" class="text-input" value="${escapeHtml((article.tags || []).join(", "))}" />
            </div>
            <div>
              <label class="input-label">SEO keywords</label>
              <input name="seoKeywords" class="text-input" value="${escapeHtml((article.seoKeywords || []).join(", "))}" />
            </div>
          </div>
          <div class="field-grid two-col">
            <div>
              <label class="input-label">SEO title</label>
              <input name="seoTitle" class="text-input" value="${escapeHtml(article.seoTitle || "")}" />
            </div>
            <div>
              <label class="input-label">SEO description</label>
              <input name="seoDescription" class="text-input" value="${escapeHtml(article.seoDescription || "")}" />
            </div>
          </div>
          <div class="field-grid two-col">
            <div>
              <label class="input-label">Featured image</label>
              <input id="editor-image-upload" type="file" accept="image/*" class="text-input" />
            </div>
            <div>
              <label class="input-label">Image alt text</label>
              <input name="imageAlt" class="text-input" value="${escapeHtml(article.imageAlt || "")}" />
            </div>
          </div>
          <div class="checkbox-row">
            <label class="checkbox-pill"><input type="checkbox" name="featured" ${article.featured ? "checked" : ""} /> Featured</label>
            <label class="checkbox-pill"><input type="checkbox" name="trending" ${article.trending ? "checked" : ""} /> Trending</label>
            <span class="meta-copy">Estimated reading time: <strong id="reading-time-output">${readingTime} min</strong></span>
          </div>
        </div>

        <div class="editor-section">
          <div class="section-header">
            <h3 class="section-title">FAQ editor</h3>
            <button id="add-faq-row" class="button button-secondary" type="button">Add FAQ</button>
          </div>
          <div class="faq-editor-list">${editorFaqRows(article)}</div>
        </div>

        <div class="button-row">
          <button class="button button-primary" type="submit">Save article</button>
          <button id="preview-editor-article" class="button button-secondary" type="button">Preview</button>
        </div>
      </form>

      <aside class="editor-side-stack">
        <section class="editor-panel editor-metrics-card">
          <div class="image-preview">
            <img src="${article.featuredImage || "assets/images/placeholder-pet.svg"}" alt="${escapeHtml(article.imageAlt || article.title || "Article preview")}" />
          </div>
          <div class="editor-section">
            <p class="muted-copy">Generated keyword</p>
            <strong>${escapeHtml(article.keyword || "Not set yet")}</strong>
          </div>
          <div class="editor-section">
            <p class="muted-copy">Local preview path</p>
            <strong>${escapeHtml(article.slug ? `article.html?slug=${article.slug}` : "Save or generate a slug first")}</strong>
          </div>
          <div class="editor-section">
            <p class="muted-copy">Article metrics</p>
            <div class="topic-chip-row">
              <span class="topic-chip">${wordCount} words</span>
              <span class="topic-chip">${readingTime} min read</span>
              <span class="topic-chip">${(article.tags || []).length} tags</span>
            </div>
          </div>
        </section>

        <section class="editor-panel editor-metrics-card">
          <div class="section-header compact-header">
            <h3 class="section-title">Publishing checklist</h3>
          </div>
          <ul class="editor-checklist">
            ${checklist
              .map(
                (item) => `
                  <li>
                    <span>${escapeHtml(item.label)}</span>
                    <strong class="check-${item.tone}">${escapeHtml(item.value)}</strong>
                  </li>
                `
              )
              .join("")}
          </ul>
        </section>
      </aside>
    </div>
  `;

  const titleInput = byId("editor-title");
  const slugInput = byId("editor-slug");
  const contentInput = byId("editor-content");

  titleInput.addEventListener("input", () => {
    if (!slugInput.dataset.touched) {
      slugInput.value = slugify(titleInput.value);
    }
  });
  slugInput.addEventListener("input", () => {
    slugInput.dataset.touched = "true";
  });
  contentInput.addEventListener("input", () => {
    byId("reading-time-output").textContent = `${estimateReadingTimeFromHtml(contentInput.value)} min`;
  });

  byId("add-faq-row").addEventListener("click", () => {
    const next = captureEditorState();
    next.faqItems.push({ question: "", answer: "" });
    state.editing = next;
    renderEditor();
  });

  byId("editor-image-upload").addEventListener("change", (event) => {
    const [file] = event.target.files;
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      state.editing = {
        ...captureEditorState(),
        featuredImage: reader.result,
      };
      renderEditor();
    };
    reader.readAsDataURL(file);
  });

  byId("admin-editor-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const articleData = captureEditorState();
    articleData.slug = slugify(articleData.slug || articleData.title);
    articleData.id = articleData.id || articleData.slug;
    articleData.publishDate = articleData.publishDate || new Date().toISOString();
    articleData.canonicalUrl = articlePath(articleData.slug);
    upsertAdminArticle(articleData);
    clearArticleCache();
    await refreshData();
    setView("articles");
    renderArticlesView();
    showToast("Article saved to local admin storage.");
  });

  byId("preview-editor-article").addEventListener("click", async () => {
    const articleData = captureEditorState();
    articleData.slug = slugify(articleData.slug || articleData.title);
    articleData.id = articleData.id || articleData.slug;
    upsertAdminArticle(articleData);
    clearArticleCache();
    await refreshData();
    window.open(`article.html?slug=${articleData.slug}`, "_blank", "noopener");
  });
}

function renderAutomation() {
  byId("admin-automation-view").innerHTML = `
    <section class="admin-card table-panel">
      <div class="section-header">
        <h3 class="section-title">GitHub Actions automation</h3>
      </div>
      <div class="automation-grid">
        <div>
          <p class="muted-copy">Workflow file</p>
          <strong>${PETZONE_CONFIG.repoPointers.workflow}</strong>
        </div>
        <div>
          <p class="muted-copy">Publisher</p>
          <strong>${PETZONE_CONFIG.repoPointers.publishScript}</strong>
        </div>
        <div>
          <p class="muted-copy">AI provider adapter</p>
          <strong>${PETZONE_CONFIG.repoPointers.providerScript}</strong>
        </div>
      </div>
      <p class="muted-copy">
        Daily publishing runs on GitHub Actions, not in this browser. The workflow selects a topic, generates the article with a server-side API key, validates it, updates indexes, and pushes the result back to the repository.
      </p>
    </section>

    <section class="admin-card table-panel">
      <div class="section-header">
        <h3 class="section-title">Next queued topics</h3>
      </div>
      <div class="table-scroll">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Keyword</th>
              <th>Category</th>
              <th>Intent</th>
              <th>Priority</th>
            </tr>
          </thead>
          <tbody>
            ${state.queue.queue.slice(0, 8).map((item) => `
              <tr>
                <td>${escapeHtml(item.keyword)}</td>
                <td>${escapeHtml(item.category)}</td>
                <td>${escapeHtml(item.intent)}</td>
                <td>${escapeHtml(String(item.priority))}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderSeo() {
  const topTags = Array.from(new Set(state.articles.flatMap((article) => article.tags))).slice(0, 18);
  byId("admin-seo-view").innerHTML = `
    <section class="admin-card table-panel">
      <div class="section-header">
        <h3 class="section-title">SEO output files</h3>
      </div>
      <div class="automation-grid">
        <div><strong>data/articles.json</strong><p class="muted-copy">Lightweight article summaries for homepage, category, and admin listing views.</p></div>
        <div><strong>content/posts/*.json</strong><p class="muted-copy">Full article content fetched only when an article page or editor actually needs it.</p></div>
        <div><strong>data/search-index.json</strong><p class="muted-copy">Weighted search terms, tokens, and ranking boosts for static search.</p></div>
        <div><strong>data/site-feeds.json</strong><p class="muted-copy">Precomputed homepage hero, headline, trending, and spotlight feeds.</p></div>
        <div><strong>data/category-index.json</strong><p class="muted-copy">Category digests with lead stories, topic tags, and feed ordering.</p></div>
        <div><strong>sitemap.xml</strong><p class="muted-copy">Generated sitemap for posts, categories, tags, and core marketing pages.</p></div>
      </div>
    </section>
    <section class="admin-card table-panel">
      <div class="section-header">
        <h3 class="section-title">Top taxonomy tags</h3>
      </div>
      <div class="tag-row">${topTags.map((tag) => `<span class="tag-pill">${escapeHtml(tag)}</span>`).join("")}</div>
    </section>
  `;
}

async function refreshData() {
  clearArticleCache();
  state.articles = await getAllArticles();
  state.history = await getPublishingHistory();
  state.queue = await getTopicQueue();
  renderOverview();
  renderArticlesView();
  renderEditor();
  renderAutomation();
  renderSeo();
}

async function initAdmin() {
  setPageMeta({
    title: "PetZone Admin | Editorial Desk",
    description: "Manage local PetZone content and monitor the GitHub Actions automation pipeline.",
    canonical: "/admin.html",
  });

  if (!hasValidAdminSession()) {
    clearAdminSession();
    renderLoginGate();
    return;
  }

  document.querySelectorAll(".admin-nav-link").forEach((button) => {
    button.addEventListener("click", () => {
      setView(button.dataset.adminView);
    });
  });

  hydrateSessionUi();

  byId("admin-new-article").addEventListener("click", () => {
    state.editing = emptyArticle();
    setView("editor");
    renderEditor();
  });

  byId("admin-export-data").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(getAdminArticles(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "petzone-local-articles.json";
    link.click();
    URL.revokeObjectURL(url);
  });

  byId("admin-logout").addEventListener("click", () => {
    clearAdminSession();
    window.location.reload();
  });

  state.editing = emptyArticle();
  await refreshData();
  setView("overview");
}

initAdmin().catch((error) => {
  console.error(error);
  showToast("Admin failed to load.");
});
