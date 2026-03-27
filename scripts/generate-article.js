const { DEFAULT_AUTHOR, DEFAULT_IMAGE, SITE_BASE_URL } = require("./lib/constants");
const {
  createUniqueSlug,
  estimateReadingTime,
  excerptFromHtml,
  findDuplicateArticles,
  loadArticles,
  normalizeArticle,
  normalizeGeneratedContent,
  slugify,
  tokenizeText,
} = require("./lib/content-utils");
const { generateImagePrompt } = require("./generate-image-prompt");
const aiProvider = require("./lib/ai-provider");
const { info, warn } = require("./lib/logger");

function titleCase(value = "") {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function fillTemplate(template = "", context = {}) {
  return template.replace(/\{(\w+)\}/g, (_, key) => context[key] || "");
}

function clampSeoTitle(value = "") {
  const trimmed = value.length > 68 ? `${value.slice(0, 65).trim()}...` : value;
  return trimmed;
}

async function withFallback(label, run, fallbackFactory) {
  try {
    return await run();
  } catch (error) {
    warn(`${label} failed, using deterministic fallback.`, {
      message: error.message,
    });
    return typeof fallbackFactory === "function" ? fallbackFactory() : fallbackFactory;
  }
}

function normalizeExcerptValue(value = "", contentHtml = "") {
  const trimmed = value.toString().trim();
  if (trimmed.length >= 110 && trimmed.length <= 220) {
    return trimmed;
  }
  return excerptFromHtml(contentHtml, 165);
}

function normalizeSeoDescriptionValue(value = "", contentHtml = "", topic = {}) {
  const trimmed = value.toString().trim();
  if (trimmed.length >= 120 && trimmed.length <= 170) {
    return trimmed;
  }
  const categoryLabel = topic.category === "dogs" ? "dog" : "cat";
  const fallback = `PetZone explains ${topic.keyword} with practical steps, common mistakes to avoid, and a repeatable routine for busy ${categoryLabel} owners.`;
  const description = excerptFromHtml(contentHtml, 155) || fallback;
  if (description.length >= 120 && description.length <= 170) {
    return description;
  }
  return fallback.length > 170 ? `${fallback.slice(0, 167).trim()}...` : fallback;
}

function buildArticleSlugSource(topic, title = "") {
  const cleanTitle = title.split(/[|:]/)[0].trim();
  return topic?.keyword || cleanTitle || title;
}

function getTopicModifierContext(topic) {
  if (topic.keyword.includes("in apartments")) {
    return "in smaller living spaces";
  }
  if (topic.keyword.includes("without stress")) {
    return "while keeping the routine low-stress";
  }
  if (topic.keyword.includes("for first-time owners") || topic.keyword.includes("for beginners")) {
    return "for first-time owners";
  }
  if (topic.keyword.includes("at home")) {
    return "as part of a home routine";
  }
  return "in a repeatable daily routine";
}

function buildTitle(topic) {
  const suffixMap = {
    food: "What Smart Owners Prioritize",
    training: "A Practical Routine That Sticks",
    behavior: "What It Usually Means and What Helps",
    health: "What to Watch and What to Do Next",
    beginner: "A First-Time Owner Guide",
    transactional: "What Actually Delivers Better Results",
    informational: "A Clear, Practical Guide",
  };
  const title = `${titleCase(topic.keyword)}: ${suffixMap[topic.intent] || "A Clear, Practical Guide"}`;
  return title.length > 105 ? `${title.slice(0, 102).trim()}...` : title;
}

function buildHeadings(topic) {
  const clusterHeadings = {
    "best-food-for": [
      "Audit the current feeding routine before changing brands",
      "Match protein, moisture, and calories to daily energy needs",
      "Build a transition schedule that protects digestion",
      "Track body condition, appetite, and stool quality each week",
    ],
    "how-to-stop": [
      "Stop the behavior from being rehearsed again and again",
      "Teach a replacement behavior the pet can actually repeat",
      "Reward the right choice fast enough to matter",
      "Track triggers so setbacks become easier to predict",
    ],
    "kitten-litter-training": [
      "Set the schedule before you expect perfect consistency",
      "Make the bathroom setup easy to find and easy to use",
      "Use calm repetition to reduce avoidable accidents",
      "Track progress so the routine gets simpler each week",
    ],
    "puppy-potty-training": [
      "Set the schedule before you expect perfect consistency",
      "Make the bathroom setup easy to find and easy to use",
      "Use calm repetition to reduce avoidable accidents",
      "Track progress so the routine gets simpler each week",
    ],
    "how-to-calm": [
      "Build safe associations before the stressful moment arrives",
      "Reduce sensory overload during the hardest part of the routine",
      "Use short practice sessions to build tolerance gradually",
      "Plan a recovery routine so stress does not stack up",
    ],
    "best-toys-for": [
      "Match toy type to the pet's real energy pattern",
      "Use rotation so play stays novel without becoming chaotic",
      "Pair toys with routines that guide chewing, chasing, or stalking",
      "Retire worn items before they become a safety problem",
    ],
    "how-to-reduce": [
      "Check the daily routine before assuming the issue is purely seasonal",
      "Support the coat, skin, and home environment together",
      "Use grooming and cleaning habits that are easy to repeat",
      "Know when the pattern is bigger than home care alone",
    ],
    "wet-vs-dry": [
      "Compare moisture, calories, and convenience side by side",
      "Match the feeding format to the pet's health and routine",
      "Transition gradually so digestion stays steady",
      "Review the outcome with data instead of marketing claims",
    ],
    "how-to-introduce": [
      "Start with separation so the first impression stays manageable",
      "Use scent and distance to lower social pressure",
      "Control the first direct interactions carefully",
      "Keep the household setup fair after the introduction phase",
    ],
    "how-to-help": [
      "Identify the daily barrier before adding more products",
      "Use comfort supports that the pet can tolerate repeatedly",
      "Adjust the home setup so the routine feels easier",
      "Track the response and escalate when comfort keeps slipping",
    ],
    "cat-enrichment-ideas": [
      "Match enrichment to the cat's energy and confidence level",
      "Use the room layout to create more hunting and climbing opportunities",
      "Rotate play so novelty stays high without overstimulation",
      "Measure success through calmer behavior between sessions",
    ],
    "dog-exercise-ideas": [
      "Match exercise to the dog's age, drive, and recovery ability",
      "Use the home and neighborhood to create more variety",
      "Blend mental work with movement to avoid overdoing pure intensity",
      "Measure success through calmer behavior after the activity",
    ],
  };
  if (clusterHeadings[topic.cluster]) {
    return clusterHeadings[topic.cluster];
  }
  const animal = topic.category === "dogs" ? "dog" : "cat";
  const map = {
    food: [
      `Start with your ${animal}'s age, weight, and routine`,
      "Choose ingredients that support digestion and consistency",
      "Build a feeding schedule you can actually maintain",
      "Track appetite, stool quality, energy, and weight",
    ],
    training: [
      "Make the behavior easy to repeat in short sessions",
      "Set up the environment before asking for perfect choices",
      "Reward timing matters more than long training sessions",
      "Measure progress weekly and adjust before frustration builds",
    ],
    behavior: [
      "Look at triggers, timing, and environment before reacting",
      "Reduce stressors that keep the behavior going",
      "Use replacement behaviors instead of punishment",
      "Know when the pattern points to a deeper health concern",
    ],
    health: [
      "Notice baseline habits before symptoms feel urgent",
      "Use home observation to make better care decisions",
      "Support comfort without masking warning signs",
      "Know exactly when to call your veterinarian",
    ],
    beginner: [
      "Set up the home routine before problems start",
      "Use simple habits that lower daily stress",
      "Keep food, sleep, and enrichment predictable",
      "Build confidence by tracking what works each week",
    ],
    informational: [
      "Start with the everyday routine behind the topic",
      "Focus on habits that make improvement sustainable",
      "Avoid common owner mistakes that slow progress",
      "Use weekly check-ins to keep the plan realistic",
    ],
  };
  return map[topic.intent] || map.informational;
}

function buildFaq(topic) {
  const animal = topic.category === "dogs" ? "dog" : "cat";
  return [
    {
      question: `How quickly can ${topic.keyword} improve?`,
      answer: `Small improvements often show up within one to two weeks when your ${animal}'s routine becomes more consistent. Bigger changes usually depend on daily repetition, stress reduction, and tracking the same signals every week.`,
    },
    {
      question: `What is the biggest mistake owners make with ${topic.keyword}?`,
      answer: `The most common mistake is changing too many things at once. Start with one clear adjustment, keep it steady for several days, and measure appetite, sleep, energy, or behavior before adding something new.`,
    },
    {
      question: `When should I call a veterinarian about ${topic.keyword}?`,
      answer: `Call your veterinarian when the issue is severe, sudden, painful, keeps getting worse, or comes with vomiting, diarrhea, breathing changes, weakness, or a major shift in appetite or thirst.`,
    },
    {
      question: `Can I use the same plan for every ${animal}?`,
      answer: `Not exactly. Age, breed type, medical history, home layout, and stress level all change what works best, so use these recommendations as a framework and adjust to your ${animal}'s real response.`,
    },
  ];
}

function buildSectionPlan(topic) {
  const plans = {
    "best-food-for": [
      {
        lead: "{keyword} works better when owners start with the current routine instead of chasing a label promise.",
        action: "Audit meal timing, treat totals, hydration, and activity before changing foods so the next decision solves a real problem.",
        subhead: "Reader checklist: routine audit",
        bullets: [
          "Write down meals, treats, and water habits for three days",
          "Compare calorie intake with the pet's age and activity",
          "Notice whether appetite dips after stress or routine changes",
        ],
      },
      {
        lead: "Ingredient quality only helps when it matches the pet's age, digestion, and day-to-day energy pattern.",
        action: "Compare protein sources, moisture, and calorie density so your {animal} gets a sustainable feeding plan instead of a short trial.",
        subhead: "This week's focus: ingredient fit",
        bullets: [
          "Check calories per serving before increasing portions",
          "Use moisture support when hydration is part of the goal",
          "Avoid changing foods and toppers at the same time",
        ],
      },
      {
        lead: "Most feeding setbacks come from transitions that are too fast for the gut and too rushed for the home schedule.",
        action: "Blend foods gradually, keep feeding times steady, and pause the transition if stool quality or appetite clearly worsens.",
        subhead: "Weekly checkpoint: transition pace",
        bullets: [
          "Shift the ratio over several meals or days",
          "Keep treats simple during the transition week",
          "Track stool quality and appetite at each stage",
        ],
      },
      {
        lead: "A strong feeding plan shows up in body condition, energy, appetite, and stool quality rather than in packaging claims.",
        action: "Review those same signals each week so {keyword} becomes a measurable system instead of a guess.",
        subhead: "This week's focus: measurable progress",
        bullets: [
          "Review weight trends every one to two weeks",
          "Use the same weekly notes for appetite and energy",
          "Escalate to a veterinarian if weight or appetite changes suddenly",
        ],
      },
    ],
    "how-to-stop": [
      {
        lead: "{keyword} improves faster when the environment stops rewarding the unwanted behavior in the first place.",
        action: "Reduce access to the trigger, shorten supervision gaps, and make the better choice easier than the old habit.",
        subhead: "This week's focus: prevention before correction",
        bullets: [
          "Block or manage the most common trigger locations",
          "Prepare redirect tools before the behavior starts",
          "Keep everyone in the home using the same response",
        ],
      },
      {
        lead: "Most pets stop repeating a habit when they have a simpler replacement behavior that earns relief or reward just as quickly.",
        action: "Choose one replacement, rehearse it in easy conditions, and bring it into the real trigger gradually.",
        subhead: "Reader checklist: replacement behavior",
        bullets: [
          "Use one cue and one reward pattern for clarity",
          "Start in easy conditions before adding distractions",
          "Keep practice short enough that the pet can keep winning",
        ],
      },
      {
        lead: "Timing matters more than intensity, especially when frustration builds before the owner responds.",
        action: "Reward the replacement immediately and keep the response to the old behavior calm, brief, and predictable.",
        subhead: "Weekly checkpoint: reward timing",
        bullets: [
          "Deliver rewards within a second or two of the right choice",
          "Reinforce calm moments before the trigger escalates",
          "Avoid loud corrections that add more arousal",
        ],
      },
      {
        lead: "Tracking is what turns {keyword} from a guessing game into a solvable routine problem.",
        action: "Log the time, trigger, intensity, and recovery time so patterns around sleep, boredom, hunger, or noise become visible.",
        subhead: "This week's focus: trigger tracking",
        bullets: [
          "Record the trigger and how long recovery takes",
          "Check whether the issue clusters around one time of day",
          "Adjust sleep, enrichment, or distance before raising difficulty",
        ],
      },
    ],
    "kitten-litter-training": [
      {
        lead: "{keyword} improves when the schedule is predictable enough that your {animal} rarely has to guess what comes next.",
        action: "Build bathroom breaks around waking, meals, play, and transitions so timing creates success before accidents create patterns.",
        subhead: "Reader checklist: timing first",
        bullets: [
          "Use the same checkpoints every day for the first week",
          "Guide the pet immediately after meals and naps",
          "Avoid long unsupervised gaps during the learning phase",
        ],
      },
      {
        lead: "The bathroom setup needs to be convenient, clean, and low-friction or the pet will keep searching for an easier option.",
        action: "Place the setup where it is easy to reach, keep the route quiet, and remove old scent from mistakes completely.",
        subhead: "This week's focus: setup quality",
        bullets: [
          "Keep the area quiet and easy to reach",
          "Use enough opportunities for the pet's age and stamina",
          "Clean accidents fully so old scent trails do not pull the pet back",
        ],
      },
      {
        lead: "Accidents are information, not a reason to make the routine louder or more complicated.",
        action: "Interrupt gently when you can, guide the pet to the correct spot, and reward the finish instead of focusing on the mistake.",
        subhead: "Weekly checkpoint: calm correction",
        bullets: [
          "Do not punish after the accident has already happened",
          "Reward the correct location every time it happens",
          "Watch for patterns in time of day, room choice, or flooring",
        ],
      },
      {
        lead: "The goal is a repeatable rhythm that improves from week to week, not a perfect day by accident.",
        action: "Count successes, accidents, and how much prompting was needed so you can widen freedom without losing the habit.",
        subhead: "This week's focus: visible progress",
        bullets: [
          "Count successful trips alongside accidents",
          "Increase freedom slowly after several strong days",
          "Review medical causes if progress suddenly stalls",
        ],
      },
    ],
    "puppy-potty-training": [
      {
        lead: "{keyword} improves when the schedule is predictable enough that your {animal} rarely has to guess what comes next.",
        action: "Build bathroom breaks around waking, meals, play, and transitions so timing creates success before accidents create patterns.",
        subhead: "Reader checklist: timing first",
        bullets: [
          "Use the same checkpoints every day for the first week",
          "Guide the pet immediately after meals and naps",
          "Avoid long unsupervised gaps during the learning phase",
        ],
      },
      {
        lead: "The bathroom setup needs to be convenient, clean, and low-friction or the pet will keep searching for an easier option.",
        action: "Place the setup where it is easy to reach, keep the route quiet, and remove old scent from mistakes completely.",
        subhead: "This week's focus: setup quality",
        bullets: [
          "Keep the area quiet and easy to reach",
          "Use enough opportunities for the pet's age and stamina",
          "Clean accidents fully so old scent trails do not pull the pet back",
        ],
      },
      {
        lead: "Accidents are information, not a reason to make the routine louder or more complicated.",
        action: "Interrupt gently when you can, guide the pet to the correct spot, and reward the finish instead of focusing on the mistake.",
        subhead: "Weekly checkpoint: calm correction",
        bullets: [
          "Do not punish after the accident has already happened",
          "Reward the correct location every time it happens",
          "Watch for patterns in time of day, room choice, or flooring",
        ],
      },
      {
        lead: "The goal is a repeatable rhythm that improves from week to week, not a perfect day by accident.",
        action: "Count successes, accidents, and how much prompting was needed so you can widen freedom without losing the habit.",
        subhead: "This week's focus: visible progress",
        bullets: [
          "Count successful trips alongside accidents",
          "Increase freedom slowly after several strong days",
          "Review medical causes if progress suddenly stalls",
        ],
      },
    ],
    "how-to-calm": [
      {
        lead: "{keyword} gets easier when the trigger appears in calm practice sessions instead of only in hard moments.",
        action: "Introduce the setup quietly, pair it with choice and reward, and end early enough that the {animal} can still stay composed.",
        subhead: "This week's focus: safety cues",
        bullets: [
          "Leave the setup visible during calm parts of the day",
          "Reward investigation before you reward duration",
          "End practice while the pet is still coping well",
        ],
      },
      {
        lead: "Stress falls faster when the environment is quieter, more predictable, and easier for the pet to recover from.",
        action: "Reduce noise, visual chaos, and rushed handling so the hardest step of the routine stays manageable.",
        subhead: "Reader checklist: reduce overload",
        bullets: [
          "Prepare the route, room, or carrier before bringing the pet over",
          "Use familiar bedding or scent cues where appropriate",
          "Keep the hardest step short instead of pushing one long repetition",
        ],
      },
      {
        lead: "The most reliable calming plans are built from short repetitions that stay below the pet's panic threshold.",
        action: "Practice for a few minutes, stop early, and repeat often enough that the routine stays familiar without becoming exhausting.",
        subhead: "Weekly checkpoint: practice dosage",
        bullets: [
          "Prefer multiple short practices over one difficult session",
          "Increase duration only after relaxed body language appears",
          "Step back quickly if vocalizing or struggling escalates",
        ],
      },
      {
        lead: "Recovery is part of the plan because stressed pets can stay tense long after the trigger disappears.",
        action: "After the event, provide quiet space, water, familiar routines, and decompression time before asking for anything new.",
        subhead: "This week's focus: post-event recovery",
        bullets: [
          "Use the same calm-down routine after each stressful event",
          "Delay extra visitors or noisy play after the trigger",
          "Track how long it takes the pet to return to baseline",
        ],
      },
    ],
  };

  return plans[topic.cluster] || [
    {
      lead: "{keyword} improves when the routine gets simpler, more predictable, and easier for the {animal} to repeat.",
      action: "Use one focused adjustment at a time, keep the environment calm, and measure the response before adding something new.",
      subhead: "Weekly checkpoint: setup and timing",
      bullets: [
        "Choose one change to test for several days",
        "Write down what improved and what stayed difficult",
        "Adjust timing, setup, or intensity before making the plan bigger",
      ],
    },
    {
      lead: "The environment should make the right behavior easier than the old habit.",
      action: "Change the setup before asking for perfect choices so the plan stays fair and repeatable.",
      subhead: "Reader checklist: environment fit",
      bullets: [
        "Reduce the most common friction points",
        "Keep cues and routines consistent across the home",
        "Make the preferred option easy to access",
      ],
    },
    {
      lead: "Short daily repetitions usually work better than occasional perfect days because pets learn from predictable patterns.",
      action: "Keep sessions realistic enough that you can repeat them for a full week before judging the result.",
      subhead: "This week's focus: repeatability",
      bullets: [
        "Use the same checkpoints every day",
        "Review progress before adding more difficulty",
        "Keep notes on triggers, timing, and recovery",
      ],
    },
    {
      lead: "A stronger plan comes from tracking signals early instead of waiting until the problem feels urgent.",
      action: "Use a short weekly review so you can keep what works and simplify what is clearly adding friction.",
      subhead: "Weekly checkpoint: progress review",
      bullets: [
        "Compare the same signals at the end of the week",
        "Keep the plan lean enough to maintain",
        "Escalate when symptoms, pain, or decline appear",
      ],
    },
  ];
}

function buildRelatedSuggestions(topic, existingArticles = [], desiredCount = 4) {
  const topicTokens = new Set(tokenizeText(topic.keyword));
  const ranked = existingArticles
    .map((article) => {
      const keywordTokens = tokenizeText(article.keyword || article.title || "");
      const sharedTokens = keywordTokens.filter((token) => topicTokens.has(token)).length;
      const clusterScore = article.cluster && article.cluster === topic.cluster ? 8 : 0;
      const tagScore = (article.tags || []).filter((tag) => {
        const normalizedTag = slugify(tag);
        return normalizedTag === topic.cluster || topic.keyword.includes(tag.toLowerCase());
      }).length;
      const intentScore = article.intent && article.intent === topic.intent ? 2 : 0;
      return {
        article,
        score: (article.category === topic.category ? 5 : 0) + clusterScore + sharedTokens * 3 + tagScore * 2 + intentScore,
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, desiredCount);

  if (ranked.length) {
    return ranked.map(({ article, score }) => ({
      slug: article.slug,
      anchor: article.title,
      reason:
        article.category === topic.category
          ? `Related ${topic.category} coverage with overlapping search intent (score ${score}).`
          : `Supporting cross-category coverage with overlapping search intent (score ${score}).`,
    }));
  }

  return existingArticles.slice(0, desiredCount).map((article) => ({
    slug: article.slug,
    anchor: article.title,
    reason: "Recommended background article from the existing archive.",
  }));
}

function paragraph(parts) {
  return `<p>${parts.join(" ")}</p>`;
}

function buildSeedContent(topic, internalLinks) {
  const animal = topic.category === "dogs" ? "dog" : "cat";
  const pluralAnimal = topic.category === "dogs" ? "dogs" : "cats";
  const headings = buildHeadings(topic);
  const faqItems = buildFaq(topic);
  const modifierContext = getTopicModifierContext(topic);
  const sectionPlan = buildSectionPlan(topic);

  const intro = [
    paragraph([
      `${titleCase(topic.keyword)} matters because routines shape how comfortable, calm, and healthy ${pluralAnimal} feel every day.`,
      "Most owners do not need a dramatic overhaul; they need a repeatable plan that fits their home, budget, and schedule.",
      `That is especially true ${modifierContext}, where small changes in setup and timing often decide whether progress holds.`,
    ]),
    paragraph([
      "The strongest results usually come from looking at the whole picture: sleep, food timing, enrichment, stress triggers, and recovery time.",
      `When one part of the day feels rushed, ${pluralAnimal} often show it through appetite changes, attention-seeking, restlessness, or inconsistent behavior.`,
      `A practical plan works because it reduces friction for both the owner and the ${animal}.`,
    ]),
  ];

  const sections = headings
    .map((heading, index) => {
      const supportKeyword = internalLinks[index % internalLinks.length]?.anchor || titleCase(topic.keyword);
      const section = sectionPlan[index % sectionPlan.length];
      const sectionContext = {
        animal,
        pluralAnimal,
        keyword: topic.keyword,
        modifierContext,
        supportKeyword,
      };
      return `
        <h2>${heading}</h2>
        ${paragraph([
          fillTemplate(section.lead, sectionContext),
          fillTemplate(section.action, sectionContext),
          `Owners who document patterns around ${topic.keyword} usually reach a clearer decision faster than owners who keep changing the plan from memory.`,
        ])}
        ${paragraph([
          `Consistency matters more than intensity ${modifierContext}.`,
          `Short daily routines work better than occasional perfect days because ${pluralAnimal} learn from repetition and predictability.`,
          "If you want durable progress, choose one or two adjustments you can maintain for at least a week, review the response honestly, and then build on what improved.",
          `That same approach also makes it easier to connect this article with related coverage such as ${supportKeyword}.`,
        ])}
        <h3>${fillTemplate(section.subhead, sectionContext)}</h3>
        <ul>
          ${section.bullets.map((item) => `<li>${fillTemplate(item, sectionContext)}</li>`).join("")}
        </ul>
      `;
    })
    .join("\n");

  const internalLinksBlock = `
    <section class="internal-links-block">
      <h2>Internal links that strengthen this topic cluster</h2>
      <p>PetZone publishes related articles in topical clusters so readers can move from a quick answer to a full routine without losing context.</p>
      <ul>
        ${internalLinks
          .map(
            (link) =>
              `<li><a href="${SITE_BASE_URL}/posts/${link.slug}/">${link.anchor}</a> <span>- ${link.reason}</span></li>`
          )
          .join("")}
      </ul>
    </section>
  `;

  const faqSection = `
    <section class="faq-snippet">
      <h2>Frequently asked questions</h2>
      ${faqItems
        .map(
          (item) => `
            <h3>${item.question}</h3>
            ${paragraph([item.answer])}
          `
        )
        .join("")}
    </section>
  `;

  const conclusion = paragraph([
    `${titleCase(topic.keyword)} gets easier when the plan is realistic enough to repeat and specific enough to measure.`,
    "Use the next seven days to simplify the routine, remove friction points, and track the same signals every day.",
    `That approach creates a better experience for your ${animal} now and gives you stronger evidence if you need veterinary advice later.`,
  ]);

  return {
    contentHtml: `${intro.join("\n")}\n${sections}\n${internalLinksBlock}\n${faqSection}\n${conclusion}`,
    faqItems,
  };
}

function buildSeedArticle(topic, existingArticles = [], index = 0) {
  const title = buildTitle(topic);
  const slug = createUniqueSlug(buildArticleSlugSource(topic, title), existingArticles.map((article) => article.slug));
  const internalLinkSuggestions = buildRelatedSuggestions(topic, existingArticles);
  const { contentHtml, faqItems } = buildSeedContent(topic, internalLinkSuggestions);
  const clusterLabel = topic.cluster.replace(/-/g, " ");
  const intentLabelMap = {
    informational: "pet advice",
    transactional: "buying guide",
    beginner: "first-time owners",
    health: "health basics",
    training: "training",
    food: "feeding",
    behavior: "behavior",
  };
  const modifierTag = topic.keyword.includes("for beginners")
    ? "first-time owners"
    : topic.keyword.includes("in apartments")
      ? "apartments"
      : topic.keyword.includes("without stress")
        ? "low-stress routines"
        : topic.keyword.includes("for first-time owners")
          ? "first-time owners"
          : topic.keyword.includes("at home")
            ? "at home"
            : "";
  const tags = Array.from(
    new Set(
      [
        topic.category,
        intentLabelMap[topic.intent] || topic.intent,
        clusterLabel,
        modifierTag,
        topic.category === "dogs" ? "dog care" : "cat care",
      ].filter(Boolean)
    )
  );
  const seoKeywords = Array.from(new Set([topic.keyword, clusterLabel, ...tags]));
  const publishDate = new Date(Date.now() - (index + 1) * 86400000).toISOString();

  return normalizeArticle({
    id: slug,
    title,
    slug,
    keyword: topic.keyword,
    excerpt: excerptFromHtml(contentHtml, 165),
    content: contentHtml,
    category: topic.category,
    intent: topic.intent,
    cluster: topic.cluster,
    topicType: topic.type,
    tags,
    featuredImage: DEFAULT_IMAGE,
    imageAlt: `${title} editorial illustration`,
    author: DEFAULT_AUTHOR,
    publishDate,
    updatedDate: publishDate,
    featured: index < 5,
    trending: index < 8,
    status: "published",
    seoTitle: clampSeoTitle(`${title} | PetZone`),
    seoDescription: `PetZone explains ${topic.keyword} with practical steps, common mistakes to avoid, and a repeatable routine for busy ${topic.category === "dogs" ? "dog" : "cat"} owners.`,
    seoKeywords,
    faqItems,
    schemaType: "BlogPosting",
    readingTime: estimateReadingTime(contentHtml),
    relatedPostIds: internalLinkSuggestions.map((link) => link.slug),
    internalLinkSuggestions,
    score: {
      seoScore: 85,
      readabilityScore: 82,
      structureScore: 88,
      internalLinkScore: 84,
      notes: ["Seed article generated from editorial template."],
    },
    canonicalUrl: `${SITE_BASE_URL}/posts/${slug}/`,
    source: "seed",
  });
}

async function generateLiveArticle(topic, existingArticles = []) {
  const fallbackTitle = buildTitle(topic);
  const deterministicLinks = buildRelatedSuggestions(topic, existingArticles, 5);
  const fallbackOutline = {
    h1: fallbackTitle,
    sections: buildHeadings(topic).map((heading) => ({
      h2: heading,
      h3: ["What to check this week"],
    })),
  };

  const titleIdeas = await withFallback(
    "AI title ideas",
    () => aiProvider.generateTitles(topic),
    () => ({ titles: [fallbackTitle] })
  );
  const outline = await withFallback(
    "AI outline",
    () => aiProvider.generateOutline(topic, topic.keyword),
    () => fallbackOutline
  );
  const draft = await withFallback(
    "AI article draft",
    () =>
      aiProvider.generateArticle({
        topic,
        selectedTitle: titleIdeas.titles?.[0],
        outline,
        tone: "trustworthy editorial",
        targetLength: "1100-1400 words",
      }),
    () => {
      const seeded = buildSeedContent(topic, deterministicLinks);
      return {
        title: fallbackTitle,
        excerpt: excerptFromHtml(seeded.contentHtml, 165),
        contentHtml: seeded.contentHtml,
        keyTakeaways: [],
        internalLinkSuggestions: deterministicLinks,
        faqItems: seeded.faqItems,
      };
    }
  );

  const candidateTitles = [draft.title, ...(titleIdeas.titles || []), fallbackTitle].filter(Boolean);
  const duplicateTitles = new Set(
    existingArticles
      .filter((article) => article.title)
      .map((article) => article.title.toLowerCase())
  );
  const selectedTitle =
    candidateTitles.find((candidate) => !duplicateTitles.has(candidate.toLowerCase())) ||
    `${fallbackTitle} Update`;
  const faq = await withFallback(
    "AI FAQ",
    () =>
      aiProvider.generateFaq({
        keyword: topic.keyword,
        category: topic.category,
        title: selectedTitle,
        outline,
      }),
    () => ({ faqItems: draft.faqItems || buildFaq(topic) })
  );
  const seo = await withFallback(
    "AI SEO metadata",
    () =>
      aiProvider.generateSeoMeta({
        keyword: topic.keyword,
        category: topic.category,
        title: selectedTitle,
        excerpt: draft.excerpt,
      }),
    () => ({
      seoTitle: `${selectedTitle} | PetZone`,
      seoDescription: "",
      seoKeywords: [topic.keyword, topic.cluster.replace(/-/g, " "), topic.category],
    })
  );
  const tags = await withFallback(
    "AI tags",
    () =>
      aiProvider.generateTags({
        keyword: topic.keyword,
        category: topic.category,
        title: selectedTitle,
      }),
    () => ({
      tags: Array.from(
        new Set([
          topic.category,
          topic.cluster.replace(/-/g, " "),
          topic.intent,
          topic.category === "dogs" ? "dog care" : "cat care",
        ])
      ),
    })
  );
  const score = await withFallback(
    "AI content score",
    () =>
      aiProvider.scoreArticle({
        keyword: topic.keyword,
        category: topic.category,
        title: selectedTitle,
        contentHtml: draft.contentHtml,
      }),
    () => ({
      seoScore: 78,
      readabilityScore: 80,
      structureScore: 82,
      internalLinkScore: 84,
      notes: ["Fallback score generated after AI scoring failed."],
    })
  );
  const normalizedContent = normalizeGeneratedContent(draft.contentHtml || draft.content || "");
  const slug = createUniqueSlug(buildArticleSlugSource(topic, selectedTitle), existingArticles.map((article) => article.slug));
  const existingSlugSet = new Set(existingArticles.map((article) => article.slug));
  const fallbackInternalLinks = deterministicLinks;
  const mergedInternalLinks = [
    ...(Array.isArray(draft.internalLinkSuggestions) ? draft.internalLinkSuggestions : []),
    ...fallbackInternalLinks,
  ].reduce((accumulator, item) => {
    const normalizedItem =
      typeof item === "string"
        ? { slug: slugify(item), anchor: item, reason: "Relevant archive article." }
        : {
            slug: item.slug,
            anchor: item.anchor || item.title || item.slug,
            reason: item.reason || "Relevant archive article.",
          };
    if (
      normalizedItem.slug
      && existingSlugSet.has(normalizedItem.slug)
      && !accumulator.some((entry) => entry.slug === normalizedItem.slug)
    ) {
      accumulator.push(normalizedItem);
    }
    return accumulator;
  }, []).slice(0, 5);

  const excerpt = normalizeExcerptValue(draft.excerpt || "", normalizedContent || "");
  const seoDescription = normalizeSeoDescriptionValue(seo.seoDescription || "", normalizedContent || "", topic);

  const normalized = normalizeArticle({
    id: slug,
    title: selectedTitle,
    slug,
    keyword: topic.keyword,
    excerpt,
    content: normalizedContent,
    category: topic.category,
    intent: topic.intent,
    cluster: topic.cluster,
    topicType: topic.type,
    tags: Array.from(new Set((tags.tags || []).map((tag) => tag.toString().trim()).filter(Boolean))).slice(0, 6),
    featuredImage: DEFAULT_IMAGE,
    imageAlt: `${selectedTitle} editorial illustration`,
    author: DEFAULT_AUTHOR,
    publishDate: new Date().toISOString(),
    updatedDate: new Date().toISOString(),
    featured: false,
    trending: false,
    status: "published",
    seoTitle: clampSeoTitle(seo.seoTitle || `${selectedTitle} | PetZone`),
    seoDescription,
    seoKeywords: seo.seoKeywords || tags.tags || [],
    faqItems: faq.faqItems || buildFaq(topic),
    schemaType: "BlogPosting",
    readingTime: estimateReadingTime(normalizedContent || ""),
    relatedPostIds: [],
    internalLinkSuggestions: mergedInternalLinks,
    score,
    canonicalUrl: "",
    source: "ai",
  });

  const duplicates = findDuplicateArticles(normalized, existingArticles, {
    titleThreshold: 0.88,
    contentThreshold: 0.76,
  });
  if (duplicates.length) {
    warn("Generated article looks too similar to existing archive content.", duplicates.slice(0, 3));
    throw new Error(`Duplicate-content prevention blocked article generation for keyword "${topic.keyword}".`);
  }

  info("Generated live article draft", {
    title: normalized.title,
    slug: normalized.slug,
    internalLinks: normalized.internalLinkSuggestions.length,
  });

  return normalized;
}

async function createArticleFromTopic(topic, options = {}) {
  const existingArticles = options.existingArticles || loadArticles();
  const article = options.source === "ai"
    ? await generateLiveArticle(topic, existingArticles)
    : buildSeedArticle(topic, existingArticles, options.index ?? existingArticles.length);

  article.featuredImagePrompt = generateImagePrompt(article);
  article.canonicalUrl = `${SITE_BASE_URL}/posts/${article.slug}/`;
  return article;
}

if (require.main === module) {
  const topicArg = process.argv[2];
  if (!topicArg) {
    throw new Error("Pass a topic JSON string to generate an article.");
  }
  const topic = JSON.parse(topicArg);
  const source = process.argv.includes("--ai") ? "ai" : "seed";
  createArticleFromTopic(topic, { source })
    .then((article) => {
      process.stdout.write(`${JSON.stringify(article, null, 2)}\n`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = {
  buildSeedArticle,
  createArticleFromTopic,
};
