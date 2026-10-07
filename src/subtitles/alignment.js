const logger = require("../config/logger");
const { getWhisperWordTimestamps } = require("./whisper");

// VTT fallback parsing removed as per requirements

/**
 * Matches whisper output tokens to the original quote text.
 * Falls back to strict estimation only in development.
 */
function matchWhisperToQuote(whisperWords, quoteText) {
  const rawWords = quoteText.split(/\s+/).filter((w) => w.length > 0);
  const matched = [];
  let wIndex = 0; // index in whisperWords

  let matchedCount = 0;

  for (let i = 0; i < rawWords.length; i++) {
    const qWord = rawWords[i];
    const qNorm = qWord.toLowerCase().replace(/[^\w]/g, "");

    if (!qNorm) {
      // It's just punctuation, group with previous
      matched.push({
        word: qWord,
        start: null,
        end: null,
      });
      continue;
    }

    let found = false;
    // Look ahead in whisper words up to a limit
    for (let j = wIndex; j < Math.min(wIndex + 6, whisperWords.length); j++) {
      const wWord = whisperWords[j].word;
      const wNorm = wWord.toLowerCase().replace(/[^\w]/g, "");

      if (wNorm && wNorm === qNorm) {
        let wStart = whisperWords[j].start;
        let wEnd = whisperWords[j].end;
        
        // Reject invalid/clustered whisper timestamps (e.g., when Whisper decoder fails and clusters them at the end)
        if (wStart >= wEnd - 0.01) {
          wStart = null;
          wEnd = null;
        }

        matched.push({
          word: qWord,
          start: wStart,
          end: wEnd,
        });
        wIndex = j + 1;
        found = true;
        matchedCount++;
        break;
      }
    }

    if (!found) {
      matched.push({
        word: qWord,
        start: null,
        end: null,
      });
    }
  }

  // Find the maximum end time from whisperWords to know the audio boundary
  let maxAudioEnd = 0;
  for (const w of whisperWords) {
    if (w.end > maxAudioEnd) maxAudioEnd = w.end;
  }

  // Pass 2: Interpolate missing times proportionally
  // First, find contiguous blocks of nulls
  let i = 0;
  while (i < matched.length) {
    if (matched[i].start === null) {
      let blockStartIdx = i;
      let blockEndIdx = i;
      while (blockEndIdx < matched.length && matched[blockEndIdx].start === null) {
        blockEndIdx++;
      }
      blockEndIdx--; // Last null in this block

      // Determine the time boundaries for this block
      let prevValidEnd = 0;
      if (blockStartIdx > 0 && matched[blockStartIdx - 1].start !== null) {
        prevValidEnd = matched[blockStartIdx - 1].end;
      }

      let nextValidStart = maxAudioEnd;
      if (blockEndIdx < matched.length - 1 && matched[blockEndIdx + 1].start !== null) {
        nextValidStart = matched[blockEndIdx + 1].start;
      }

      // If nextValidStart is smaller than prevValidEnd, clamp it
      if (nextValidStart < prevValidEnd) {
        nextValidStart = prevValidEnd;
      }

      const availableTime = nextValidStart - prevValidEnd;
      
      // Calculate total characters in this block for proportional distribution
      let totalChars = 0;
      for (let j = blockStartIdx; j <= blockEndIdx; j++) {
        totalChars += Math.max(1, matched[j].word.length);
      }

      // Distribute the available time
      let currentTime = prevValidEnd;
      for (let j = blockStartIdx; j <= blockEndIdx; j++) {
        const charCount = Math.max(1, matched[j].word.length);
        const fraction = totalChars > 0 ? (charCount / totalChars) : (1 / (blockEndIdx - blockStartIdx + 1));
        const dur = availableTime * fraction;
        
        matched[j].start = currentTime;
        matched[j].end = currentTime + dur;
        currentTime += dur;
      }
      
      i = blockEndIdx + 1;
    } else {
      i++;
    }
  }

  // Generate alignment report
  const coverage = Math.round((matchedCount / rawWords.length) * 100);
  const unmatchedSource = rawWords.length - matchedCount;

  logger.info(`[ALIGNMENT-REPORT] Source Words: ${rawWords.length}, Whisper Words: ${whisperWords.length}`);
  logger.info(`[ALIGNMENT-REPORT] Matched: ${matchedCount}, Unmatched Source: ${unmatchedSource}, Coverage: ${coverage}%`);

  if (process.env.DEBUG_MODE === "true") {
    const fs = require("fs");
    const path = require("path");
    const crypto = require("crypto");
    const hash = crypto.randomBytes(4).toString("hex");
    fs.writeFileSync(
      path.resolve(__dirname, `../../output/debug_alignment_${hash}.json`),
      JSON.stringify(matched, null, 2)
    );
  }

  return matched;
}

/**
 * Extracts precise word-level alignment for the audio using local whisper.cpp
 */
async function getWordAlignment(audioPath, text, ttsSrtPath) {
  logger.info("[ALIGNMENT] Generating word-level timing...");

  let whisperWords = null;
  try {
    whisperWords = await getWhisperWordTimestamps(audioPath);
  } catch (err) {
    logger.error(`[ALIGNMENT] Whisper processing failed: ${err.message}`);
    // If whisper enabled but failed, do not silently fallback
    if (process.env.WHISPER_ENABLED === "true") {
      throw new Error(`Real alignment failed: ${err.message}`);
    }
  }

  if (whisperWords && whisperWords.length > 0) {
    const aligned = matchWhisperToQuote(whisperWords, text);
    return aligned;
  }

  // Fallback is only allowed if WHISPER_ENABLED is false (development fallback)
  if (process.env.WHISPER_ENABLED === "true" || process.env.NODE_ENV === "production") {
    throw new Error("[ALIGNMENT] Production alignment failure. Whisper did not return timestamps.");
  }

  logger.warn(
    "[ALIGNMENT] Real audio-derived timing disabled. Falling back to explicit proportional estimation for dev.",
  );

  // Basic proportional fallback (only for DEV)
  const ffmpeg = require("fluent-ffmpeg");
  const util = require("util");
  const ffprobe = util.promisify(ffmpeg.ffprobe);

  let duration = 5;
  try {
    const metadata = await ffprobe(audioPath);
    duration = metadata.format.duration;
  } catch (e) {
    logger.warn(
      "[ALIGNMENT] Could not probe audio duration, assuming 5 seconds.",
    );
  }

  const rawWords = text.split(/\s+/).filter((w) => w.length > 0);
  const charCounts = rawWords.map((w) => w.length);
  const totalChars = charCounts.reduce((sum, count) => sum + count, 0);

  let currentTime = 0.3; // small start padding
  const words = [];
  const availableTime = Math.max(duration - 0.5, 0.5); // leave some buffer

  for (let i = 0; i < rawWords.length; i++) {
    const dur = Math.max((charCounts[i] / totalChars) * availableTime, 0.12);
    words.push({
      word: rawWords[i],
      start: currentTime,
      end: currentTime + dur,
    });
    currentTime += dur;
  }

  logger.info(`[ALIGNMENT] Estimated ${words.length} word alignments.`);
  return words;
}

module.exports = {
  getWordAlignment,
  matchWhisperToQuote
};
