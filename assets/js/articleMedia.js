function prefixAssetPath(path, prefix = "") {
  if (!path || /^https?:\/\//i.test(path) || path.startsWith("data:")) {
    return path;
  }
  const cleanPath = path.replace(/^\.?\//, "");
  return `${prefix}${cleanPath}`;
}

const visualCatalog = {
  cats: {
    routine: "assets/images/article-cats-routine.svg",
    food: "assets/images/article-cats-food.svg",
    behavior: "assets/images/article-cats-behavior.svg",
    health: "assets/images/article-cats-health.svg",
  },
  dogs: {
    routine: "assets/images/article-dogs-routine.svg",
    food: "assets/images/article-dogs-food.svg",
    behavior: "assets/images/article-dogs-behavior.svg",
    health: "assets/images/article-dogs-health.svg",
  },
};

function detectVisualTheme(article, heading = "", index = 0) {
  const headingText = `${heading}`.toLowerCase();
  const fallbackText = `${article.intent || ""} ${article.cluster || ""} ${article.keyword || ""}`.toLowerCase();
  if (/(food|feed|meal|diet|water|bowl|nutrition|dry|wet)/.test(headingText)) {
    return "food";
  }
  if (/(health|senior|vet|mobility|drink|shed|skin|coat|pain|comfort)/.test(headingText)) {
    return "health";
  }
  if (/(behavior|calm|biting|scratching|introduce|toy|thunder|carrier|enrichment|stress)/.test(headingText)) {
    return "behavior";
  }
  if (/(training|puppy|kitten|exercise|schedule|routine|beginner|owner)/.test(headingText)) {
    return "routine";
  }
  if (index === 0 && /(food|feed|meal|diet|water|bowl|nutrition|dry|wet)/.test(fallbackText)) {
    return "food";
  }
  if (index === 0 && /(health|senior|vet|mobility|drink|shed|skin|coat|pain|comfort)/.test(fallbackText)) {
    return "health";
  }
  if (index === 0 && /(behavior|calm|biting|scratching|introduce|toy|thunder|carrier|enrichment|stress)/.test(fallbackText)) {
    return "behavior";
  }
  return ["routine", "behavior", "health", "food"][index % 4];
}

export function resolveArticleVisual(article, heading = "", index = 0, prefix = "") {
  const category = article.category === "dogs" ? "dogs" : "cats";
  const theme = detectVisualTheme(article, heading, index);
  const src = prefixAssetPath(visualCatalog[category][theme], prefix);
  return {
    src,
    alt: `${article.categoryLabel || category} ${theme} illustration for ${article.title}`,
    caption: `Visual guide: ${heading || article.title}`,
  };
}

export function resolveArticleFeaturedImage(article, prefix = "") {
  const current = article.featuredImage || "";
  if (current && !current.includes("placeholder-pet.svg")) {
    return prefixAssetPath(current, prefix);
  }
  return resolveArticleVisual(article, article.title, 0, prefix).src;
}

export function buildInlineArticleFigure(article, heading = "", index = 0, prefix = "") {
  const visual = resolveArticleVisual(article, heading, index, prefix);
  return `
    <figure class="article-inline-visual">
      <img src="${visual.src}" alt="${visual.alt}" loading="lazy" />
      <figcaption>${visual.caption}</figcaption>
    </figure>
  `;
}
