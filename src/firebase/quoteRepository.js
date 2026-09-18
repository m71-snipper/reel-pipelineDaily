const { db } = require("../config/firebase");
const logger = require("../config/logger");

const COLLECTION_NAME = "instagram_quotes";

/**
 * Selects an eligible quote from Firebase that hasn't been posted yet.
 */
async function selectEligibleQuote() {
  try {
    logger.info("[FIREBASE] Searching for eligible quotes...");

    // We want quotes where is_posted is false.
    // Since Firebase doesn't easily let us query for missing fields (like generation_status),
    // we fetch a small batch and pick the first truly eligible one.
    const snapshot = await db
      .collection(COLLECTION_NAME)
      .where("is_posted", "==", false)
      .limit(10)
      .get();

    if (snapshot.empty) {
      logger.warn("[FIREBASE] No eligible quotes found.");
      return null;
    }

    let selectedDoc = null;
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const status = data.generation_status;
      // Skip if another worker has claimed it or already generated it
      if (status === "CLAIMED" || status === "GENERATING" || status === "GENERATED") {
        continue;
      }
      selectedDoc = doc;
      break;
    }

    if (!selectedDoc) {
      logger.warn("[FIREBASE] All unposted quotes are currently locked or generating.");
      return null;
    }

    const data = selectedDoc.data();
    
    // Claim it immediately to prevent concurrent workers from picking it
    await db.collection(COLLECTION_NAME).doc(selectedDoc.id).set(
      {
        generation_status: "CLAIMED",
        claimed_at: new Date().toISOString()
      },
      { merge: true }
    );

    // The workflow requires returning specific fields
    const quote = {
      firestoreDocId: selectedDoc.id,
      quote_id: data.quote_id || selectedDoc.id,
      category: data.category,
      quote: data.quote,
      author: data.author,
      is_posted: data.is_posted,
      timestamp: data.timestamp,
    };

    logger.info(`[FIREBASE] Selected & Claimed quote: ${quote.quote_id} (Doc ID: ${quote.firestoreDocId})`);

    return quote;
  } catch (error) {
    logger.error("[FIREBASE] Error selecting quote:", error);
    throw error;
  }
}

module.exports = {
  selectEligibleQuote,
};
