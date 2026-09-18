const admin = require("firebase-admin");
const logger = require("./logger");

function initFirebase() {
  if (admin.apps.length > 0) {
    return admin;
  }

  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
    logger.info("[FIREBASE] Connection initialized successfully.");
  } catch (error) {
    logger.error("[FIREBASE] Failed to initialize connection:", error);
    throw error;
  }

  return admin;
}

const db = initFirebase().firestore();

module.exports = { admin, db };
