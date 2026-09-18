const logger = require("../config/logger");

/**
 * Groups individual word alignments into subtitle phrases/lines.
 * Focuses on semantic grouping, natural punctuation handling, and readability.
 */
function groupCaptions(words, styleConfig = {}) {
  logger.info("[CAPTIONS] Grouping words into smart captions...");
  
  // Default bounds
  let maxWordsPerLine = 5;
  let maxCharsPerLine = 24;

  // Adjust bounds if font size is known
  if (styleConfig.fontSize) {
    if (styleConfig.fontSize >= 75) {
      maxWordsPerLine = 4;
      maxCharsPerLine = 20;
    }
  }

  const lines = [];
  let currentLine = [];
  let currentChars = 0;

  for (let i = 0; i < words.length; i++) {
    const wordObj = words[i];
    const wordText = wordObj.word;
    const cleanWord = wordText.replace(/[^\w]/g, "");

    currentLine.push(wordObj);
    currentChars += wordText.length + 1; // +1 for space

    const isLastWord = i === words.length - 1;
    const nextWordObj = words[i + 1];
    
    // Natural breaking points
    const endsWithStrongPunctuation = /[.!?]/.test(wordText);
    const endsWithWeakPunctuation = /[,;:]/.test(wordText);
    
    // Check limits
    const isTooLong = currentChars >= maxCharsPerLine;
    const isMaxWords = currentLine.length >= maxWordsPerLine;

    // We shouldn't leave the NEXT line with just one short word if we can help it.
    // If breaking here means the next word is the last word in the whole quote, just pull it in (if it fits visually)
    // or push the current word to the next line.
    
    let shouldBreak = false;

    if (endsWithStrongPunctuation) {
      shouldBreak = true; // Always break on full stops, exclamation marks
    } else if (isTooLong || isMaxWords) {
      shouldBreak = true;
    } else if (endsWithWeakPunctuation && currentChars > maxCharsPerLine * 0.6) {
      // Break early on a comma if we're already past 60% of the line length
      shouldBreak = true;
    }

    // Anti-hanging word logic: if breaking now leaves exactly 1 word remaining in the whole video,
    // don't break unless strictly necessary.
    if (shouldBreak && !isLastWord && i === words.length - 2) {
       // Only 1 word left. Try to fit it.
       if (currentChars + nextWordObj.word.length < maxCharsPerLine + 5) {
         shouldBreak = false;
       }
    }

    // Force break if we somehow got massive
    if (currentChars > maxCharsPerLine + 8) {
      shouldBreak = true;
    }

    if (isLastWord) {
      shouldBreak = true;
    }

    if (shouldBreak) {
      const lineStart = currentLine[0].start;
      const lineEnd = currentLine[currentLine.length - 1].end;
      const text = currentLine.map((w) => w.word).join(" ");

      lines.push({
        text,
        start: lineStart,
        end: lineEnd,
        words: [...currentLine],
      });

      currentLine = [];
      currentChars = 0;
    }
  }

  logger.info(`[CAPTIONS] Generated ${lines.length} caption segments.`);
  return lines;
}

module.exports = {
  groupCaptions,
};
