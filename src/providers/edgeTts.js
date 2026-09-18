const { exec } = require("child_process");
const util = require("util");
const fs = require("fs");
const logger = require("../config/logger");

const execAsync = util.promisify(exec);

async function generateSpeech({
  text,
  voice = "en-US-ChristopherNeural",
  rate = "0%",
  outputPath,
  srtPath,
}) {
  logger.info(`[TTS] Provider: edge (Voice: ${voice}, Rate: ${rate})`);

  // Clean up text for CLI injection
  const cleanText = text.replace(/"/g, "'").replace(/\n/g, " ");

  try {
    let rateArg = "";
    if (rate && rate !== "0%") {
      rateArg = `--rate=${rate}`;
    }

    // Using python -m edge_tts in case the binary isn't in PATH
    const command = `python -m edge_tts --text "${cleanText}" --voice ${voice} ${rateArg} --write-media "${outputPath}"`;

    const fullCommand = srtPath
      ? `${command} --write-subtitles "${srtPath}"`
      : command;

    await execAsync(fullCommand);

    if (!fs.existsSync(outputPath)) {
      throw new Error("TTS output file was not created.");
    }

    logger.info(`[TTS] Audio generated successfully at ${outputPath}`);

    if (srtPath && fs.existsSync(srtPath)) {
      const srtContent = fs.readFileSync(srtPath, "utf8");
      if (!srtContent.trim()) {
        logger.warn(
          `[TTS] WordBoundary not supported by this voice, generated subtitle file is empty.`,
        );
      }
    }

    return {
      audioPath: outputPath,
      srtPath: srtPath,
    };
  } catch (error) {
    logger.error(`[TTS] Edge TTS failed: ${error.message}`);
    throw error;
  }
}

module.exports = {
  generateSpeech,
};
