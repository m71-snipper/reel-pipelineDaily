const { exec, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const util = require("util");
const crypto = require("crypto");
const logger = require("../config/logger");

const execAsync = util.promisify(exec);

/**
 * Checks if a file exists
 */
function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch (err) {
    return false;
  }
}

/**
 * Run whisper.cpp to extract word-level timestamps.
 * 
 * @param {string} audioPath The path to the source audio (usually from TTS)
 * @param {string} quoteText The exact text spoken in the audio
 * @returns {Promise<Array<{word: string, start: number, end: number}>>}
 */
async function getWhisperWordTimestamps(audioPath, quoteText = "") {
  const isEnabled = process.env.WHISPER_ENABLED === "true";
  if (!isEnabled) {
    logger.warn("[WHISPER] Whisper is disabled via WHISPER_ENABLED.");
    return null; // Signals that Whisper wasn't run
  }

  const modelPath = path.resolve(
    process.env.WHISPER_MODEL_PATH || path.join(__dirname, "../../models/ggml-base.en.bin")
  );
  
  // Use .exe if on Windows, otherwise just the binary name
  const binExt = process.platform === "win32" ? ".exe" : "";
  const defaultBin = `main${binExt}`;
  
  const binPath = path.resolve(
    process.env.WHISPER_BIN_PATH || path.join(__dirname, "../../bin/whisper/", defaultBin)
  );

  const threads = process.env.WHISPER_THREADS || "4";

  if (!fileExists(modelPath)) {
    throw new Error(`[WHISPER] Model file not found at ${modelPath}. Please download it (e.g. ggml-base.en.bin).`);
  }
  if (!fileExists(binPath)) {
    throw new Error(`[WHISPER] Binary not found at ${binPath}. Please download whisper.cpp for your platform.`);
  }

  const hash = crypto.randomBytes(8).toString("hex");
  const tempWavPath = path.resolve(__dirname, `../../output/debug_whisper_${hash}.wav`);

  try {
    logger.info(`[WHISPER] Converting audio to 16kHz mono WAV for whisper.cpp...`);
    // Standard 16kHz 16-bit mono PCM required by whisper.cpp
    await execAsync(`ffmpeg -y -i "${audioPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${tempWavPath}"`);

    logger.info(`[WHISPER] Running whisper.cpp on ${tempWavPath}...`);
    
    // Output json to file to avoid buffer limits
    const jsonOutPath = path.resolve(__dirname, `../../output/debug_whisper_${hash}`);
    
    // Clean quote text for prompt context
    const cleanPrompt = quoteText.replace(/"/g, '\\"');
    
    // -ojf (output full json with tokens and offsets). Note: Do NOT use -nt (it disables timestamps)
    const command = `"${binPath}" -m "${modelPath}" -f "${tempWavPath}" -t ${threads} -l en -ojf --prompt "${cleanPrompt}" -of "${jsonOutPath}"`;
    
    const { stdout, stderr } = await execAsync(command);
    
    const expectedJsonPath = `${jsonOutPath}.json`;
    if (!fileExists(expectedJsonPath)) {
      throw new Error(`[WHISPER] Expected JSON output not found at ${expectedJsonPath}`);
    }

    const rawData = fs.readFileSync(expectedJsonPath, "utf8");
    const parsed = JSON.parse(rawData);

    // Extract raw non-special tokens from all segments
    const rawTokens = [];
    if (parsed.transcription && Array.isArray(parsed.transcription)) {
      for (const segment of parsed.transcription) {
        if (segment.tokens && Array.isArray(segment.tokens)) {
          for (const token of segment.tokens) {
            let startSec = 0;
            let endSec = 0;
            if (token.offsets && typeof token.offsets.from === 'number') {
              startSec = token.offsets.from / 1000;
              endSec = token.offsets.to / 1000;
            } else if (token.t0 !== undefined) {
              startSec = (token.t0 * 10) / 1000;
              endSec = (token.t1 * 10) / 1000;
            }

            const rawText = token.text || "";
            const clean = rawText.trim();
            // Ignore whisper special tokens
            if (clean && !clean.startsWith("[_") && !clean.endsWith("_]") && !clean.startsWith("<|") && !clean.endsWith("|>")) {
              rawTokens.push({
                rawText: rawText,
                word: clean,
                start: startSec,
                end: endSec
              });
            }
          }
        }
      }
    }

    // Group BPE tokens into complete words based on leading space
    const words = [];
    let currentWord = null;

    for (let i = 0; i < rawTokens.length; i++) {
      const t = rawTokens[i];
      const startsWithSpace = t.rawText.startsWith(" ");

      if (startsWithSpace || !currentWord) {
        if (currentWord) words.push(currentWord);
        currentWord = {
          word: t.word,
          start: t.start,
          end: Math.max(t.end, t.start + 0.05)
        };
      } else {
        // Continuation token (subword or punctuation suffix)
        currentWord.word += t.word;
        currentWord.end = Math.max(currentWord.end, t.end);
      }
    }
    if (currentWord) words.push(currentWord);

    // Bridge 0-duration words to next word start if available
    for (let i = 0; i < words.length; i++) {
      if (words[i].end <= words[i].start + 0.02) {
        const nextStart = words[i + 1] ? words[i + 1].start : words[i].start + 0.15;
        words[i].end = Math.max(words[i].start + 0.05, nextStart);
      }
    }

    logger.info(`[WHISPER] Extracted and assembled ${words.length} words from whisper.cpp.`);

    // If DEBUG_MODE is not true, clean up debug artifacts
    if (process.env.DEBUG_MODE !== "true") {
      try { fs.unlinkSync(tempWavPath); } catch (e) {}
      try { fs.unlinkSync(expectedJsonPath); } catch (e) {}
    }

    return words;
  } catch (error) {
    logger.error(`[WHISPER] Transcription failed: ${error.message}`);
    throw error;
  }
}

module.exports = {
  getWhisperWordTimestamps
};
