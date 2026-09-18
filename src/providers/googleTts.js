const logger = require("../config/logger");

/**
 * Stub for future Google TTS provider integration.
 */
async function generateSpeech({ text, voice, outputPath, srtPath }) {
  logger.warn("[TTS] Google TTS provider is not yet implemented.");
  throw new Error("Not implemented");
}

module.exports = {
  generateSpeech,
};
