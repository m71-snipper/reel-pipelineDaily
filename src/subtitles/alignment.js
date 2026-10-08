const logger = require("../config/logger");
const { getWhisperWordTimestamps } = require("./whisper");
const ffmpeg = require("fluent-ffmpeg");
const util = require("util");
const ffprobe = util.promisify(ffmpeg.ffprobe);

async function getAudioFacts(audioPath) {
  const facts = { duration: 5, speechStart: 0, speechEnd: 5 };
  try {
    const meta = await ffprobe(audioPath);
    facts.duration = parseFloat(meta.format.duration) || 5;
    facts.speechEnd = facts.duration;
  } catch (e) {
    return facts;
  }

  await new Promise((resolve) => {
    let pendingSilenceStart = null;
    let firstChecked = false;

    ffmpeg(audioPath)
      .audioFilters("silencedetect=noise=-35dB:d=0.25")
      .format("null")
      .output("-")
      .on("stderr", (line) => {
        const s = line.match(/silence_start:\s*([\d.]+)/);
        const e = line.match(/silence_end:\s*([\d.]+)/);
        if (s) pendingSilenceStart = parseFloat(s[1]);
        if (e) {
          if (!firstChecked) {
            // initial silence -> speech yahan se start hoti hai
            if (pendingSilenceStart !== null && pendingSilenceStart < 0.15) {
              facts.speechStart = parseFloat(e[1]);
            }
            firstChecked = true;
          }
          pendingSilenceStart = null;
        }
      })
      .on("end", () => {
        // trailing silence (last silence_start jiska end nahi aaya)
        if (pendingSilenceStart !== null && pendingSilenceStart > facts.speechStart + 0.2) {
          facts.speechEnd = pendingSilenceStart;
        }
        resolve();
      })
      .on("error", () => resolve())
      .run();
  });

  facts.speechEnd = Math.min(facts.speechEnd, facts.duration);
  facts.speechStart = Math.min(facts.speechStart, facts.speechEnd - 0.2);
  return facts;
}

function normWord(w) {
  return w.toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9']/g, "")
    .replace(/^'+|'+$/g, "");
}

function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j-1] + 1,
        prev[j-1] + (a[i-1] === b[j-1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

function wordsEqual(q, w) {
  if (q === w) return true;
  // ASR variants catch karo: "gonna"/"going", "dont"/"don't" etc.
  if (q.length >= 4 && w.length >= 4) {
    return lev(q, w) <= (Math.max(q.length, w.length) > 8 ? 2 : 1);
  }
  return false;
}

function matchWhisperToQuote(whisperWords, quoteText, audioFacts = null) {
  const hardStart = audioFacts ? audioFacts.speechStart : 0;
  const fallbackEnd = audioFacts ? audioFacts.speechEnd : null;
  const audioDuration = audioFacts ? audioFacts.duration : null;

  const rawWords = quoteText.split(/\s+/).filter((w) => w.length > 0);
  const matched = [];
  let wIndex = 0, lastAcceptedEnd = -1;
  let matchedCount = 0, realWordCount = 0, nullWordCount = 0;

  for (let i = 0; i < rawWords.length; i++) {
    const qWord = rawWords[i];
    const qNorm = normWord(qWord);

    if (!qNorm) {
      // punctuation-only: baad me previous word se glue hoga (nullCount me NAHI jayega)
      matched.push({ word: qWord, start: null, end: null, punctOnly: true });
      continue;
    }
    realWordCount++;

    let found = false;
    const winEnd = Math.min(wIndex + 8, whisperWords.length);

    for (let j = wIndex; j < winEnd; j++) {
      const w = whisperWords[j];
      const wNorm = normWord(w.word || "");
      if (!wNorm || !wordsEqual(qNorm, wNorm)) continue;
      // clustered/invalid timestamps
      if (w.start == null || w.end == null || w.start >= w.end - 0.01) continue;
      // hallucination back-jump guard
      if (w.start < lastAcceptedEnd - 0.05) continue;
      if (w.end - w.start > 3.0) continue;

      matched.push({ word: qWord, start: w.start, end: w.end });
      lastAcceptedEnd = w.end;
      wIndex = j + 1;
      found = true;
      matchedCount++;
      break;
    }

    if (!found) {
      matched.push({ word: qWord, start: null, end: null });
      nullWordCount++;
    }
  }

  // punctuation ko previous word ke end se glue karo
  for (let i = 0; i < matched.length; i++) {
    if (matched[i].punctOnly && i > 0 && matched[i-1].end != null) {
      matched[i].start = matched[i-1].end;
      matched[i].end = matched[i-1].end;
    }
  }

  const maxWhisperEnd = whisperWords.reduce((m, w) => Math.max(m, w.end || 0), 0);
  const hardEnd = fallbackEnd ?? maxWhisperEnd;

  // BROKEN detection — ab real words par based hai (punct fix)
  let whisperIsBroken =
    matchedCount === 0 ||
    (realWordCount > 0 && nullWordCount / realWordCount > 0.3) ||
    (audioDuration != null && maxWhisperEnd > audioDuration + 0.5);

  if (whisperIsBroken) {
    logger.warn(`[ALIGNMENT] Whisper unreliable (${nullWordCount}/${realWordCount}). Proportional fallback.`);
    let totalChars = 0, totalPause = 0;
    for (let j = 0; j < matched.length; j++) {
      if (!matched[j].punctOnly) totalChars += Math.max(1, (normWord(matched[j].word) || "x").length);
      if (j < matched.length - 1) {
        if (matched[j].word.endsWith(",")) totalPause += 0.25;
        else if (/[.!?]$/.test(matched[j].word)) totalPause += 0.4;
      }
    }
    // REAL speech boundaries use karo (0.1 guess nahi)
    const spanStart = hardStart + 0.05;
    const spanEnd = Math.max(spanStart + 0.5, hardEnd - 0.1);
    const available = Math.max(0.5, spanEnd - spanStart - totalPause);

    let t = spanStart;
    for (let j = 0; j < matched.length; j++) {
      if (matched[j].punctOnly) {
        matched[j].start = j > 0 ? matched[j-1].end : t;
        matched[j].end = matched[j].start;
        continue;
      }
      const chars = Math.max(1, (normWord(matched[j].word) || "x").length);
      const dur = available * (chars / totalChars);
      matched[j].start = t;
      matched[j].end = t + dur;
      t += dur;
      if (j < matched.length - 1) {
        if (matched[j].word.endsWith(",")) t += 0.25;
        else if (/[.!?]$/.test(matched[j].word)) t += 0.4;
      }
    }
  } else {
    // Pass 2: Interpolate missing times proportionally
    // First, find contiguous blocks of nulls
    let i = 0;
    while (i < matched.length) {
      if (matched[i].start === null && !matched[i].punctOnly) {
        let blockStartIdx = i;
        let blockEndIdx = i;
        while (blockEndIdx < matched.length && matched[blockEndIdx].start === null && !matched[blockEndIdx].punctOnly) {
          blockEndIdx++;
        }
        blockEndIdx--; // Last null in this block

        // Determine the time boundaries for this block
        let prevValidEnd = hardStart + 0.05;
        if (blockStartIdx > 0 && matched[blockStartIdx - 1].start !== null) {
          prevValidEnd = matched[blockStartIdx - 1].end;
        }

        let nextValidStart = hardEnd - 0.1;
        if (blockEndIdx < matched.length - 1 && matched[blockEndIdx + 1].start !== null) {
          nextValidStart = matched[blockEndIdx + 1].start;
        }

        // If nextValidStart is smaller than prevValidEnd, clamp it
        if (nextValidStart < prevValidEnd) {
          nextValidStart = prevValidEnd;
        }

        const availableTime = nextValidStart - prevValidEnd;
        
        // Calculate total characters and local pause time in this block for proportional distribution
        let totalChars = 0;
        let localPauseTime = 0;
        for (let j = blockStartIdx; j <= blockEndIdx; j++) {
          if (!matched[j].punctOnly) totalChars += Math.max(1, (normWord(matched[j].word) || "x").length);
          if (j < blockEndIdx) { // Don't add pause for the last word in the block
            if (matched[j].word.endsWith(",")) localPauseTime += 0.25;
            else if (/[.!?]$/.test(matched[j].word)) localPauseTime += 0.4;
          }
        }

        // Adjust available time to account for punctuation pauses inside the block
        let adjustedAvailableTime = Math.max(0.01, availableTime - localPauseTime);

        // Distribute the available time
        let currentTime = prevValidEnd;
        for (let j = blockStartIdx; j <= blockEndIdx; j++) {
          if (matched[j].punctOnly) {
            matched[j].start = currentTime;
            matched[j].end = currentTime;
            continue;
          }
          const chars = Math.max(1, (normWord(matched[j].word) || "x").length);
          const fraction = totalChars > 0 ? (chars / totalChars) : (1 / (blockEndIdx - blockStartIdx + 1));
          const dur = adjustedAvailableTime * fraction;
          
          matched[j].start = currentTime;
          matched[j].end = currentTime + dur;
          currentTime += dur;
          
          // Inject pause if needed
          if (j < blockEndIdx) {
            if (matched[j].word.endsWith(",")) currentTime += 0.25;
            else if (/[.!?]$/.test(matched[j].word)) currentTime += 0.4;
          }
        }
        
        i = blockEndIdx + 1;
      } else {
        i++;
      }
    }
  }

  // FINAL safety pass: monotonic + clamp
  for (let k = 0; k < matched.length; k++) {
    const m = matched[k];
    if (m.start == null) { m.start = k > 0 ? matched[k-1].end : hardStart; m.end = m.start; }
    if (audioDuration != null) {
      m.start = Math.max(0, Math.min(m.start, audioDuration));
      m.end = Math.max(0, Math.min(m.end, audioDuration));
    }
    if (m.end < m.start) m.end = m.start;
    if (k > 0 && m.start < matched[k-1].end) {
      m.start = matched[k-1].end;
      if (m.end < m.start) m.end = m.start;
    }
  }

  const coverage = realWordCount > 0 ? Math.round((matchedCount / realWordCount) * 100) : 0;
  logger.info(`[ALIGNMENT-REPORT] Matched: ${matchedCount}/${realWordCount}, Coverage: ${coverage}%${whisperIsBroken ? " (FALLBACK)" : ""}`);
  
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
    whisperWords = await getWhisperWordTimestamps(audioPath, text);
  } catch (err) {
    logger.error(`[ALIGNMENT] Whisper processing failed: ${err.message}`);
    // If whisper enabled but failed, do not silently fallback
    if (process.env.WHISPER_ENABLED === "true") {
      throw new Error(`Real alignment failed: ${err.message}`);
    }
  }

  if (whisperWords && whisperWords.length > 0) {
    let facts = null;
    try { facts = await getAudioFacts(audioPath); } catch (e) {}
    return matchWhisperToQuote(whisperWords, text, facts);
  }

  // Fallback is only allowed if WHISPER_ENABLED is false (development fallback)
  if (process.env.WHISPER_ENABLED === "true" || process.env.NODE_ENV === "production") {
    throw new Error("[ALIGNMENT] Production alignment failure. Whisper did not return timestamps.");
  }

  logger.warn(
    "[ALIGNMENT] Real audio-derived timing disabled. Falling back to explicit proportional estimation for dev.",
  );

  let facts = null;
  try { facts = await getAudioFacts(audioPath); } catch (e) {}
  
  let duration = facts ? facts.duration : 5;
  const rawWords = text.split(/\s+/).filter((w) => w.length > 0);
  const charCounts = rawWords.map((w) => w.length);
  const totalChars = charCounts.reduce((sum, count) => sum + count, 0);

  let currentTime = facts ? facts.speechStart + 0.05 : 0.3;
  const words = [];
  const availableTime = Math.max((facts ? facts.speechEnd : duration) - currentTime - 0.1, 0.5);

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
