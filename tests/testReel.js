require("dotenv").config();
const { runPipeline } = require("../src/pipeline/generateReel");
const logger = require("../src/config/logger");

async function testReel() {
  logger.info("===================================");
  logger.info("[TEST MODE] Starting Reel Generation");
  logger.info("===================================");

  try {
    await runPipeline();
    logger.info("===================================");
    logger.info("[TEST MODE] Completed Reel Generation");
    logger.info("===================================");
    process.exit(0);
  } catch (err) {
    logger.error(`[TEST MODE] Reel Generation Failed: ${err.message}`);
    process.exit(1);
  }
}

testReel();
