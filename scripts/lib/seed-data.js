const { slugify } = require("./content-utils");

const intents = ["informational", "transactional", "beginner", "health", "training", "food", "behavior"];

const catHighVolumeBases = [
  "cat food",
  "kitten care",
  "cat training",
  "cat behavior",
  "cat grooming",
  "indoor cat",
  "senior cat care",
  "cat health",
  "cat litter",
  "cat toys",
];

const dogHighVolumeBases = [
  "dog food",
  "puppy care",
  "dog training",
  "dog behavior",
  "dog grooming",
  "dog exercise",
  "senior dog care",
  "dog health",
  "dog treats",
  "dog breeds",
];

const highVolumeModifiers = ["tips", "guide", "advice", "routine", "checklist"];

const catLongTailBases = [
  "best food for indoor cats",
  "how to stop cat scratching furniture",
  "kitten litter training",
  "how to calm a cat in a carrier",
  "best toys for bored indoor cats",
  "how to reduce cat shedding",
  "wet vs dry food for cats",
  "how to introduce a new cat",
  "how to help a senior cat drink more water",
  "cat enrichment ideas",
];

const dogLongTailBases = [
  "best food for active dogs",
  "how to stop puppy biting",
  "puppy potty training schedule",
  "how to calm a dog during thunderstorms",
  "best toys for high energy dogs",
  "how to reduce dog shedding",
  "wet vs dry food for dogs",
  "how to introduce a rescue dog",
  "how to help a senior dog with mobility",
  "dog exercise ideas",
];

const longTailModifiers = [
  "for beginners",
  "in apartments",
  "without stress",
  "for first-time owners",
  "at home",
];

const clusterIntentMap = {
  "best-food-for": "food",
  "how-to-stop": "training",
  "kitten-litter-training": "training",
  "puppy-potty-training": "training",
  "how-to-calm": "behavior",
  "best-toys-for": "transactional",
  "how-to-reduce": "health",
  "wet-vs-dry": "food",
  "how-to-introduce": "behavior",
  "how-to-help": "health",
  "cat-enrichment-ideas": "behavior",
  "dog-exercise-ideas": "behavior",
};

const modifierIntentMap = {
  "for beginners": "beginner",
  "for first-time owners": "beginner",
  "in apartments": "informational",
};

const highVolumeIntentMap = {
  tips: "informational",
  guide: "beginner",
  advice: "informational",
  routine: "behavior",
  checklist: "transactional",
};

function inferIntent(base, modifier, type) {
  if (type === "highVolume") {
    return highVolumeIntentMap[modifier] || "informational";
  }
  const cluster = slugify(base.split(" ").slice(0, 3).join("-"));
  return modifierIntentMap[modifier] || clusterIntentMap[cluster] || "informational";
}

function generateKeywordRecords(category, bases, modifiers, type) {
  const records = [];
  bases.forEach((base, baseIndex) => {
    modifiers.forEach((modifier, modifierIndex) => {
      const keyword = `${base} ${modifier}`.trim();
      const cluster = slugify(base.split(" ").slice(0, 3).join("-"));
      const intent = inferIntent(base, modifier, type);
      const priority = type === "longTail" ? 100 - baseIndex * 4 - modifierIndex : 60 - baseIndex - modifierIndex;
      records.push({
        keyword,
        category,
        intent,
        type,
        cluster,
        priority,
      });
    });
  });
  return records;
}

function getKeywordRecords() {
  return {
    cats: {
      highVolume: generateKeywordRecords("cats", catHighVolumeBases, highVolumeModifiers, "highVolume"),
      longTail: generateKeywordRecords("cats", catLongTailBases, longTailModifiers, "longTail"),
    },
    dogs: {
      highVolume: generateKeywordRecords("dogs", dogHighVolumeBases, highVolumeModifiers, "highVolume"),
      longTail: generateKeywordRecords("dogs", dogLongTailBases, longTailModifiers, "longTail"),
    },
  };
}

function groupByIntent(records) {
  return intents.reduce((accumulator, intent) => {
    accumulator[intent] = records.filter((record) => record.intent === intent).map((record) => record.keyword);
    return accumulator;
  }, {});
}

function getKeywordData() {
  const records = getKeywordRecords();
  return {
    cats: {
      highVolume: records.cats.highVolume.map((record) => record.keyword),
      lowCompetitionLongTail: records.cats.longTail.map((record) => record.keyword),
      byIntent: groupByIntent([...records.cats.highVolume, ...records.cats.longTail]),
    },
    dogs: {
      highVolume: records.dogs.highVolume.map((record) => record.keyword),
      lowCompetitionLongTail: records.dogs.longTail.map((record) => record.keyword),
      byIntent: groupByIntent([...records.dogs.highVolume, ...records.dogs.longTail]),
    },
  };
}

function getKeywordClusters() {
  const allRecords = getKeywordRecords();
  const groups = [...allRecords.cats.longTail, ...allRecords.dogs.longTail].reduce((map, record) => {
    if (!map[record.cluster]) {
      map[record.cluster] = [];
    }
    map[record.cluster].push(record.keyword);
    return map;
  }, {});

  return Object.entries(groups).map(([cluster, keywords]) => ({
    cluster,
    primaryKeyword: keywords[0],
    supportingKeywords: keywords.slice(1, 5),
    internalLinkGoal: `Build topical authority around ${cluster.replace(/-/g, " ")} with contextual links from every related article.`,
  }));
}

function buildViralGroup(groupName, stems, patterns) {
  return stems.flatMap((stem) => patterns.map((pattern) => pattern.replace("{topic}", stem))).slice(0, 10);
}

function getViralTitles() {
  const patterns = [
    "10 Signs {topic} Is More Important Than You Think",
    "Why {topic} Keeps Happening and What Owners Can Do",
    "Best {topic} Tips Experts Still Recommend in 2026",
    "{topic}: The Common Mistake Most Owners Make",
    "What Nobody Tells You About {topic}",
  ];

  const extraPatterns = [
    "The Smart Owner's Guide to {topic}",
    "{topic}: What Changes After the First Week",
    "How to Fix {topic} Without Creating New Problems",
    "{topic} Questions Vets Hear Every Week",
    "What {topic} Looks Like in a Healthy Routine",
  ];

  return {
    cats: buildViralGroup("cats", ["Indoor Cat Food", "Cat Biting", "Night Meowing", "Senior Cat Care", "Kitten Litter Training"], patterns),
    dogs: buildViralGroup("dogs", ["Puppy Biting", "Dog Food Labels", "Leash Pulling", "Dog Anxiety", "Senior Dog Mobility"], patterns),
    care: buildViralGroup("care", ["Pet Grooming", "Pet Sleep Routines", "Vet Visit Prep", "Home Pet Safety", "Daily Care Checklists"], patterns),
    food: buildViralGroup("food", ["Wet vs Dry Food", "High Protein Meals", "Sensitive Stomach Diets", "Treat Portion Sizes", "Hydration Foods"], patterns),
    behavior: buildViralGroup("behavior", ["Cat Aggression", "Dog Reactivity", "Counter Surfing", "Separation Anxiety", "Resource Guarding"], extraPatterns),
    training: buildViralGroup("training", ["Recall Training", "Crate Training", "Loose Leash Walking", "Clicker Training", "House Training"], extraPatterns),
    health: buildViralGroup("health", ["Pet Obesity", "Dental Disease", "Joint Support", "Allergy Symptoms", "Early Illness Signs"], extraPatterns),
    "first-time-owners": buildViralGroup("first-time-owners", ["First Puppy Week", "First Cat Setup", "Beginner Feeding Plans", "Vaccination Prep", "Budget Pet Care"], patterns),
    puppies: buildViralGroup("puppies", ["8 Week Puppy Routines", "Puppy Potty Schedules", "Puppy Socialization", "Puppy Feeding Mistakes", "Puppy Naps"], patterns),
    kittens: buildViralGroup("kittens", ["Kitten Feeding", "Kitten Socialization", "Kitten Sleep", "Kitten Toys", "Kitten Litter Habits"], patterns).slice(0, 5),
    "senior-pets": buildViralGroup("senior-pets", ["Senior Dog Diets", "Senior Cat Hydration", "Mobility Support", "Pain Monitoring", "Comfortable Sleep Setups"], extraPatterns).slice(0, 5),
  };
}

function interleave(left, right, takePerSide = 15) {
  const rows = [];
  for (let index = 0; index < takePerSide; index += 1) {
    if (left[index]) {
      rows.push(left[index]);
    }
    if (right[index]) {
      rows.push(right[index]);
    }
  }
  return rows;
}

function diversifyRecords(records, count) {
  const grouped = records.reduce((map, record) => {
    if (!map[record.cluster]) {
      map[record.cluster] = [];
    }
    map[record.cluster].push(record);
    return map;
  }, {});

  const groups = Object.values(grouped);
  const picks = [];
  let round = 0;

  while (picks.length < count) {
    let addedThisRound = false;
    groups.forEach((group) => {
      if (group[round] && picks.length < count) {
        picks.push(group[round]);
        addedThisRound = true;
      }
    });
    if (!addedThisRound) {
      break;
    }
    round += 1;
  }

  return picks;
}

function getInitialSeedTopics() {
  const records = getKeywordRecords();
  return interleave(diversifyRecords(records.cats.longTail, 15), diversifyRecords(records.dogs.longTail, 15), 15);
}

function buildTopicQueue(usedKeywords = []) {
  const used = new Set(usedKeywords.map((item) => item.toLowerCase()));
  const records = getKeywordRecords();
  const ordered = interleave(records.cats.longTail, records.dogs.longTail, 50).concat(
    interleave(records.cats.highVolume, records.dogs.highVolume, 50)
  );

  return ordered.filter((record) => !used.has(record.keyword.toLowerCase()));
}

module.exports = {
  getKeywordRecords,
  getKeywordData,
  getKeywordClusters,
  getViralTitles,
  getInitialSeedTopics,
  buildTopicQueue,
};
