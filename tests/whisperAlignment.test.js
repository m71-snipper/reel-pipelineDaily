const assert = require("assert");
const { matchWhisperToQuote } = require("../src/subtitles/alignment");

function runTests() {
  console.log("Running Whisper Alignment Tests...");

  // 1. Normal multi-word quote
  const quote1 = "Hello world this is a test.";
  const whisper1 = [
    { word: "Hello", start: 0.1, end: 0.5 },
    { word: "world", start: 0.5, end: 1.0 },
    { word: "this", start: 1.0, end: 1.2 },
    { word: "is", start: 1.2, end: 1.3 },
    { word: "a", start: 1.3, end: 1.4 },
    { word: "test", start: 1.4, end: 1.8 }
  ];
  const res1 = matchWhisperToQuote(whisper1, quote1);
  assert.strictEqual(res1.length, 6, "Should have 6 words");
  assert.strictEqual(res1[0].word, "Hello");
  assert.strictEqual(res1[0].start, 0.1);
  assert.strictEqual(res1[5].end, 1.8);
  console.log("✓ Normal quote passed");

  // 2. Punctuation & Contractions
  const quote2 = "Don't stop, won't stop!";
  const whisper2 = [
    { word: "dont", start: 0.0, end: 0.5 },
    { word: "stop", start: 0.5, end: 1.0 },
    { word: "wont", start: 1.2, end: 1.5 },
    { word: "stop", start: 1.5, end: 2.0 }
  ];
  const res2 = matchWhisperToQuote(whisper2, quote2);
  assert.strictEqual(res2.length, 4, "Should have 4 words");
  assert.strictEqual(res2[0].word, "Don't");
  assert.strictEqual(res2[0].start, 0.0);
  assert.strictEqual(res2[1].word, "stop,");
  assert.strictEqual(res2[2].word, "won't");
  assert.strictEqual(res2[3].word, "stop!");
  assert.strictEqual(res2[3].end, 2.0);
  console.log("✓ Punctuation & Contractions passed");

  // 3. Repeated words
  const quote3 = "test test test";
  const whisper3 = [
    { word: "test", start: 1, end: 2 },
    { word: "test", start: 3, end: 4 },
    { word: "test", start: 5, end: 6 }
  ];
  const res3 = matchWhisperToQuote(whisper3, quote3);
  assert.strictEqual(res3[0].start, 1);
  assert.strictEqual(res3[1].start, 3);
  assert.strictEqual(res3[2].start, 5);
  console.log("✓ Repeated words passed");

  // 4. Missing timestamps (Whisper drops a word)
  const quote4 = "one two three four";
  const whisper4 = [
    { word: "one", start: 0.0, end: 0.5 },
    // "two" missing
    { word: "three", start: 1.0, end: 1.5 },
    { word: "four", start: 1.5, end: 2.0 }
  ];
  const res4 = matchWhisperToQuote(whisper4, quote4);
  assert.strictEqual(res4.length, 4);
  assert.strictEqual(res4[0].start, 0.0);
  assert.strictEqual(res4[2].start, 1.0);
  
  // 'two' should be interpolated
  assert.strictEqual(res4[1].start, 0.5); // prev end
  assert.strictEqual(res4[1].end, 0.75); // midpoint of 0.5 and 1.0
  console.log("✓ Missing timestamps interpolated passed");

  // 5. Empty transcription or mismatch (e.g. whispered nothing)
  const quote5 = "hello world";
  const whisper5 = [];
  const res5 = matchWhisperToQuote(whisper5, quote5);
  assert.strictEqual(res5.length, 2);
  // Fallback fallback puts word 1 at 0.0-0.3 and word 2 at 0.3-0.6
  // based on the fallback logic in matchWhisperToQuote
  assert.strictEqual(res5[0].start, 0);
  assert.strictEqual(res5[0].end, 0.3);
  console.log("✓ Empty transcription fallback passed");

  console.log("All whisperAlignment tests passed!");
}

try {
  process.env.DEBUG_MODE = "false"; // prevent file writes during test
  runTests();
} catch (e) {
  console.error("Test failed:", e);
  process.exit(1);
}
