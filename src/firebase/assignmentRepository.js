const { db } = require("../config/firebase");
const logger = require("../config/logger");

const ASSIGNMENTS_COLLECTION = "daily_assignments";
const QUOTES_COLLECTION = "instagram_quotes";

function getLocalDateString(timeZone) {
  const options = { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' };
  const formatter = new Intl.DateTimeFormat('en-CA', options); // en-CA gives YYYY-MM-DD
  return formatter.format(new Date());
}

async function getOrCreateDailyAssignment(slot = "0") {
  const timeZone = process.env.PIPELINE_TIMEZONE || "Asia/Karachi";
  const dateKey = getLocalDateString(timeZone);
  const docId = `${timeZone.replace(/\//g, "-")}-${dateKey}-${slot}`;

  try {
    const docRef = db.collection(ASSIGNMENTS_COLLECTION).doc(docId);
    
    // Transaction to ensure atomic creation
    const assignment = await db.runTransaction(async (t) => {
      const doc = await t.get(docRef);
      if (doc.exists) {
        logger.info(`[ASSIGNMENT] Resuming existing daily assignment for ${dateKey}`);
        return { id: doc.id, ...doc.data() };
      }

      logger.info(`[ASSIGNMENT] No assignment for ${dateKey}. Finding next eligible quote...`);
      // Find eligible unposted quotes (don't use orderBy to avoid Firebase index requirement)
      const quotesQuery = await t.get(
        db.collection(QUOTES_COLLECTION)
          .where("is_posted", "==", false)
          .limit(50) // fetch a few to skip any currently assigned
      );

      if (quotesQuery.empty) {
        throw new Error("No eligible unposted quotes available.");
      }

      // Check which quotes are already assigned
      const activeAssignments = await t.get(
        db.collection(ASSIGNMENTS_COLLECTION).where("status", "!=", "PUBLISHED")
      );
      const assignedQuoteIds = new Set(activeAssignments.docs.map(d => d.data().quoteId));

      let selectedQuote = null;
      for (const qDoc of quotesQuery.docs) {
        if (!assignedQuoteIds.has(qDoc.id)) {
          selectedQuote = qDoc;
          break;
        }
      }

      if (!selectedQuote) {
        throw new Error("All eligible quotes are currently assigned.");
      }

      const newAssignment = {
        dateKey,
        timezone: timeZone,
        quoteId: selectedQuote.id,
        status: "ASSIGNED",
        generationAttempts: 0,
        validationAttempts: 0,
        publishAttempts: 0,
        published: false,
        instagramPublished: false,
        facebookPublished: false,
        assignedAt: new Date().toISOString(),
        finalizedAt: null,
        lastError: null,
        lastRunId: process.env.GITHUB_RUN_ID || null
      };

      t.set(docRef, newAssignment);
      
      logger.info(`[ASSIGNMENT] Created new daily assignment using quote ${selectedQuote.id}`);
      return { id: docRef.id, ...newAssignment };
    });

    return assignment;

  } catch (err) {
    logger.error(`[ASSIGNMENT] Failed to get or create daily assignment: ${err.message}`);
    throw err;
  }
}

async function updateAssignment(docId, updates) {
  try {
    await db.collection(ASSIGNMENTS_COLLECTION).doc(docId).set(updates, { merge: true });
  } catch (err) {
    logger.error(`[ASSIGNMENT] Error updating assignment ${docId}: ${err.message}`);
  }
}

module.exports = {
  getOrCreateDailyAssignment,
  updateAssignment
};
