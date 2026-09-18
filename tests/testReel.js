require("dotenv").config();
const { runPipeline } = require("../src/pipeline/generateReel");
const logger = require("../src/config/logger");

async function testReel() {
  logger.info("===================================");
  logger.info("[TEST MODE] Starting Reel Generation");
  logger.info("===================================");

  await runPipeline();

  logger.info("===================================");
  logger.info("[TEST MODE] Completed Reel Generation");
  logger.info("===================================");
  process.exit(0);
}

testReel();
