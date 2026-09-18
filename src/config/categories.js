const logger = require("./logger");
const { PRESETS } = require("../subtitles/styles/presets");

const CATEGORIES = {
  "Deep Philosophical and Aesthetic": {
    pexels: [
      "cinematic nature",
      "stars sky",
      "aesthetic slow motion",
      "rain window",
      "dark clouds",
      "mountain mist",
    ],
    music: ["ambient", "piano", "cinematic", "sad"],
    visualMood: "dark, moody, cinematic",
    captionStyle: PRESETS.cinematic,
    tts: {
      provider: "edge",
      voice: "en-US-ChristopherNeural",
      rate: "-10%",
    },
  },
  "Sigma Stoic Mindset": {
    pexels: [
      "dark architecture",
      "luxury car",
      "city night",
      "sculpture",
      "black and white suit",
      "gym workout black and white",
    ],
    music: ["phonk", "darkwave", "epic", "bass"],
    visualMood: "high contrast, intense, focused",
    captionStyle: PRESETS.stoic,
    tts: {
      provider: "edge",
      voice: "en-US-GuyNeural",
      rate: "0%",
    },
  },
  "Funny Tech and Programming": {
    pexels: [
      "coding screen",
      "server room",
      "hacker dark",
      "frustrated computer",
      "keyboard typing",
    ],
    music: ["upbeat", "lofi", "quirky", "electronic"],
    visualMood: "neon, fast-paced, digital",
    captionStyle: PRESETS.tech,
    tts: {
      provider: "edge",
      voice: "en-US-EricNeural",
      rate: "+10%",
    },
  },
  "Gym and Hustle Motivation": {
    pexels: [
      "gym weightlifting",
      "running motivation",
      "boxing training",
      "athlete focus",
      "sunrise run",
    ],
    music: ["workout", "hiphop", "epic", "rock"],
    visualMood: "energetic, bright, dynamic",
    captionStyle: PRESETS.motivational,
    tts: {
      provider: "edge",
      voice: "en-US-SteffanNeural",
      rate: "+5%",
    },
  },
};

const FALLBACK_CATEGORY = {
  pexels: ["abstract background", "slow motion nature", "city timelapse"],
  music: ["lofi", "chill", "ambient"],
  visualMood: "neutral",
  captionStyle: PRESETS.default,
  tts: {
    provider: "edge",
    voice: "en-US-ChristopherNeural",
    rate: "0%",
  },
};

/**
 * Extracts simple meaning/keywords from the quote to append to queries.
 */
function extractQuoteKeywords(quote) {
  // Very basic deterministic keyword extraction for V1.
  // Remove punctuation, lowercase, remove common stop words.
  const stopWords = new Set([
    "the", "is", "in", "and", "to", "a", "of", "for", "on", "with",
    "as", "by", "that", "it", "this", "be", "are", "you", "i", "my",
    "your", "what", "where", "how", "why",
  ]);

  const words = quote
    .toLowerCase()
    .replace(/[^\w\s]/gi, "")
    .split(/\s+/);
  const meaningfulWords = words.filter(
    (w) => w.length > 4 && !stopWords.has(w),
  );

  // Return top word to avoid overcomplicating search APIs which often fail on long strings
  return meaningfulWords.length > 0 ? meaningfulWords[0] : "";
}

/**
 * Resolves the configuration for a given category and quote.
 */
function resolveCategoryConfig(categoryName, quoteText) {
  let categoryConfig = CATEGORIES[categoryName];

  if (!categoryConfig) {
    logger.warn(
      `[CATEGORY ENGINE] Unknown category encountered: "${categoryName}". Using fallback.`,
    );
    categoryConfig = FALLBACK_CATEGORY;
  }

  const quoteKeyword = extractQuoteKeywords(quoteText);

  // Pick a random base pexels query from the category
  const randomPexelsBase =
    categoryConfig.pexels[
      Math.floor(Math.random() * categoryConfig.pexels.length)
    ];

  // Combine base with quote keyword if it exists to add variety,
  // but ensure it stays a relatively generic search term.
  let finalPexelsQuery = randomPexelsBase;
  if (quoteKeyword) {
    finalPexelsQuery = `${randomPexelsBase} ${quoteKeyword}`;
  }

  // Pick random music tags
  const randomMusicTag =
    categoryConfig.music[
      Math.floor(Math.random() * categoryConfig.music.length)
    ];

  const resolved = {
    originalCategory: categoryName,
    pexelsQuery: finalPexelsQuery.trim(),
    pexelsQueries: categoryConfig.pexels, // Array of queries for storyboard variety
    quoteKeyword: quoteKeyword, // Added for quote-aware queries
    musicTag: randomMusicTag,
    visualMood: categoryConfig.visualMood,
    captionStyle: categoryConfig.captionStyle,
    tts: categoryConfig.tts,
  };

  logger.info(`[CATEGORY ENGINE] Resolved profile for "${categoryName}"`);
  return resolved;
}

module.exports = {
  CATEGORIES,
  FALLBACK_CATEGORY,
  resolveCategoryConfig,
};
