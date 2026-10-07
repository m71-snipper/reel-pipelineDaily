require("dotenv").config();
const { db } = require("../src/config/firebase");

async function resetQuotes() {
  const snapshot = await db.collection("instagram_quotes").get();
  let count = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (data.generation_status || data.is_posted) {
      await doc.ref.update({
        generation_status: require("firebase-admin").firestore.FieldValue.delete(),
        claimed_at: require("firebase-admin").firestore.FieldValue.delete(),
        is_posted: false
      });
      count++;
    }
  }
  console.log(`Reset ${count} quotes.`);
  process.exit(0);
}

resetQuotes().catch(console.error);
