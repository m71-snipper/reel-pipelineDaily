const logger = require("../config/logger");

/**
 * Generates a storyboard of visual beats from the word alignment.
 *
 * @param {Array} words - Array of word alignment objects from getWordAlignment
 * @param {Object} categoryConfig - The resolved category configuration
 * @returns {Array} - Array of beat objects
 */
function generateStoryboard(words, categoryConfig) {
  logger.info("[STORYBOARD] Generating storyboard from narration alignment...");
  
  const targetBeatDuration = 3.5; // Target length for a visual clip
  const beats = [];
  let currentBeatWords = [];
  
  if (!words || words.length === 0) {
    logger.warn("[STORYBOARD] No words provided, returning empty storyboard.");
    return beats;
  }
  
  let currentBeatStart = words[0].start;
  const queries = categoryConfig.pexelsQueries || [categoryConfig.pexelsQuery] || ["cinematic"];
  let queryIndex = 0;
  
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    currentBeatWords.push(w);
    
    const duration = w.end - currentBeatStart;
    const endsWithPunctuation = /[.,!?—:]/.test(w.word);
    
    // Break the beat if it's long enough AND we hit punctuation,
    // OR if it's getting too long (e.g. > 5s)
    // OR if there is a long pause before the next word
    const isNextWordFar = words[i + 1] && (words[i + 1].start - w.end) > 0.8;
    const isLastWord = i === words.length - 1;
    
    // Hook System: Make the very first beat (the hook) shorter and punchier
    const isFirstBeat = beats.length === 0;
    const currentTargetDuration = isFirstBeat ? 1.5 : targetBeatDuration;
    
    if ((duration >= currentTargetDuration && endsWithPunctuation) || duration > (isFirstBeat ? 2.5 : 5) || isNextWordFar || isLastWord) {
      
      const baseQuery = queries[queryIndex % queries.length];
      queryIndex++;
      
      // Combine base query with quote keyword for a highly relevant quote-aware query
      let finalQuery = baseQuery;
      if (categoryConfig.quoteKeyword) {
        finalQuery = `${baseQuery} ${categoryConfig.quoteKeyword}`.trim();
      }
      
      const motions = ["zoom_in", "pan_left", "zoom_out", "pan_right", "none"];
      // Enforce zoom_in for the hook beat for a strong opening
      const motion = isFirstBeat ? "zoom_in" : motions[beats.length % motions.length];
      
      beats.push({
        start: currentBeatStart,
        end: w.end,
        duration: w.end - currentBeatStart,
        text: currentBeatWords.map(bw => bw.word).join(" "),
        visualQuery: finalQuery,
        mood: categoryConfig.visualMood || "neutral",
        motion: motion,
        transition: "cut"
      });
      
      currentBeatWords = [];
      if (!isLastWord) {
        currentBeatStart = words[i + 1].start;
      }
    }
  }
  
  // Pad the last beat's end time slightly so the video doesn't end abruptly
  if (beats.length > 0) {
    const lastBeat = beats[beats.length - 1];
    lastBeat.end += 1.5;
    lastBeat.duration += 1.5;
  }
  
  logger.info(`[STORYBOARD] Generated ${beats.length} visual beats.`);
  return beats;
}

module.exports = {
  generateStoryboard
};
