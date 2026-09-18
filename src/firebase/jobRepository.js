const { db } = require("../config/firebase");
const logger = require("../config/logger");

const COLLECTION_NAME = "instagram_quotes";

/**
 * Updates the quote document with generation status and metadata.
 */
async function finalizeReelGeneration(quoteId, metadata) {
  try {
    logger.info(`[FIREBASE] Finalizing reel generation for quote: ${quoteId}`);

    // We only update status, do NOT set is_posted to true yet (that's for social)
    await db
      .collection(COLLECTION_NAME)
      .doc(quoteId)
      .set(
        {
          reel_metadata: {
            ...metadata,
            generated_at: new Date().toISOString(),
          },
          generation_status: metadata.status || "GENERATED",
        },
        { merge: true },
      );

    logger.info(`[FIREBASE] Reel finalized in database for ${quoteId}`);
    return true;
  } catch (error) {
    logger.error(
      `[FIREBASE] Error finalizing reel generation: ${error.message}`,
    );
    throw error;
  }
}

/**
 * Marks a quote generation as failed.
 */
async function markGenerationFailed(quoteId, errorMsg) {
  try {
    logger.warn(`[FIREBASE] Marking generation as failed for ${quoteId}`);
    await db.collection(COLLECTION_NAME).doc(quoteId).set(
      {
        generation_status: "GENERATION_FAILED",
        generation_error: errorMsg,
      },
      { merge: true },
    );
  } catch (err) {
    logger.error(`[FIREBASE] Error marking failure: ${err.message}`);
  }
}

module.exports = {
  finalizeReelGeneration,
  markGenerationFailed,
};
