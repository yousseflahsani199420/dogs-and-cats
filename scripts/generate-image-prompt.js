function generateImagePrompt(article) {
  const animal = article.category === "dogs" ? "dog" : "cat";
  const mood = article.category === "dogs" ? "energetic but trustworthy" : "calm, attentive, and premium";
  return [
    `Editorial featured image for a premium pet news article titled "${article.title}".`,
    `Subject: a healthy ${animal} in a realistic home environment.`,
    "Style: clean natural lighting, magazine photography, white background elements, subtle newsroom feel, no text overlay.",
    `Mood: ${mood}.`,
    `Focus details: ${article.keyword}, pet owner lifestyle, trustworthy care context.`,
    "Composition: horizontal 16:9, center-weighted subject, enough negative space for cropping.",
  ].join(" ");
}

if (require.main === module) {
  const article = JSON.parse(process.argv[2] || "{}");
  process.stdout.write(`${generateImagePrompt(article)}\n`);
}

module.exports = {
  generateImagePrompt,
};
