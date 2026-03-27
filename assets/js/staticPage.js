import { registerServiceWorker } from "./pwa.js";
import { copyToClipboard } from "./utils.js";

function bindStaticMobileNav() {
  const toggle = document.querySelector("[data-static-nav-toggle]");
  const menu = document.querySelector("[data-static-mobile-menu]");
  const overlay = document.querySelector("[data-static-mobile-overlay]");
  if (!toggle || !menu || !overlay) {
    return;
  }

  const closeMenu = () => {
    menu.hidden = true;
    overlay.hidden = true;
    menu.classList.remove("is-open");
    overlay.classList.remove("is-open");
    toggle.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    document.body.classList.remove("nav-open");
  };

  const openMenu = () => {
    menu.hidden = false;
    overlay.hidden = false;
    menu.classList.add("is-open");
    overlay.classList.add("is-open");
    toggle.classList.add("is-open");
    toggle.setAttribute("aria-expanded", "true");
    document.body.classList.add("nav-open");
  };

  toggle.addEventListener("click", () => {
    if (menu.hidden) {
      openMenu();
      return;
    }
    closeMenu();
  });

  overlay.addEventListener("click", closeMenu);
  menu.addEventListener("click", (event) => {
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

function bindStaticCopyButtons() {
  document.querySelectorAll("[data-copy-url]").forEach((button) => {
    button.addEventListener("click", async () => {
      await copyToClipboard(button.dataset.copyUrl || window.location.href);
      button.textContent = "Copied";
      window.setTimeout(() => {
        button.textContent = "Copy link";
      }, 1800);
    });
  });
}

function initStaticPage() {
  const main = document.querySelector("main");
  if (main && !main.id) {
    main.id = "page-content";
  }

  bindStaticMobileNav();
  bindStaticCopyButtons();
  registerServiceWorker();
}

initStaticPage();
