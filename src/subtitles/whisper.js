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
 * @returns {Promise<Array<{word: string, start: number, end: number}>>}
 */
async function getWhisperWordTimestamps(audioPath) {
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
    // whisper.cpp requires 16kHz, 16-bit, mono WAV
    await execAsync(`ffmpeg -y -i "${audioPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${tempWavPath}"`);

    logger.info(`[WHISPER] Running whisper.cpp on ${tempWavPath}...`);
    
    // We output json to a file to avoid maxBuffer issues and noisy stdout parsing
    const jsonOutPath = path.resolve(__dirname, `../../output/debug_whisper_${hash}`);
    
    // -ojf (output json full), -ml 1 (max-len doesn't strictly matter with json-full but good to enforce token-level)
    // Wait, the user said "Do not rely on --max-len 1". So we will just use -ojf.
    const command = `"${binPath}" -m "${modelPath}" -f "${tempWavPath}" -t ${threads} -l en -nt -ojf -of "${jsonOutPath}"`;
    
    await execAsync(command);
    
    const expectedJsonPath = `${jsonOutPath}.json`;
    if (!fileExists(expectedJsonPath)) {
      throw new Error(`[WHISPER] Expected JSON output not found at ${expectedJsonPath}`);
    }

    const rawData = fs.readFileSync(expectedJsonPath, "utf8");
    const parsed = JSON.parse(rawData);

    // Whisper output JSON structure from -ojf typically has "transcription" -> array of segments -> array of tokens
    // We need to flatten the tokens.
    const words = [];
    
    if (parsed.transcription && Array.isArray(parsed.transcription)) {
      for (const segment of parsed.transcription) {
        if (segment.tokens && Array.isArray(segment.tokens)) {
          for (const token of segment.tokens) {
             // token format usually includes text, t0 (start in 10ms units), t1 (end in 10ms units)
             // or sometimes timestamps are in milliseconds depending on whisper.cpp version.
             // We need to carefully parse them.
             
             // whisper.cpp v1.5.4+ JSON output:
             // token.offsets.from and token.offsets.to are in milliseconds
             let startSec = 0;
             let endSec = 0;
             
             if (token.offsets && typeof token.offsets.from === 'number') {
               startSec = token.offsets.from / 1000;
               endSec = token.offsets.to / 1000;
             } else if (token.t0 !== undefined) {
               // Fallback for older formats
               startSec = (token.t0 * 10) / 1000;
               endSec = (token.t1 * 10) / 1000;
             }
             
             const text = token.text ? token.text.trim() : "";
             if (text && !text.startsWith("[_") && !text.endsWith("_]")) {
               words.push({
                 word: text,
                 start: startSec,
                 end: endSec
               });
             }
          }
        }
      }
    }

    logger.info(`[WHISPER] Extracted ${words.length} tokens from whisper.cpp.`);

    // If DEBUG_MODE is not true, we could clean up. But the user asked to preserve DEBUG artifacts.
    if (process.env.DEBUG_MODE !== "true") {
       fs.unlinkSync(tempWavPath);
       fs.unlinkSync(expectedJsonPath);
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
