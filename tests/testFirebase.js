require("dotenv").config();
const { selectEligibleQuote } = require("../src/firebase/quoteRepository");
const logger = require("../src/config/logger");

async function run() {
  logger.info("[TEST] Starting Firebase quote selection test...");
  try {
    const quote = await selectEligibleQuote();
    if (quote) {
      logger.info("[TEST] Successfully retrieved quote:");
      console.log(JSON.stringify(quote, null, 2));
    } else {
      logger.info("[TEST] No quote retrieved (none available).");
    }
  } catch (error) {
    logger.error("[TEST] Failed with error:", error);
  } finally {
    process.exit(0);
  }
}

run();
