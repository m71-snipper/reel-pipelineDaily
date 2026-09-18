const { resolveCategoryConfig } = require("../src/config/categories");

const testCases = [
  {
    cat: "Sigma Stoic Mindset",
    quote:
      "A gem cannot be polished without friction, nor a man perfected without trials.",
  },
  {
    cat: "Funny Tech and Programming",
    quote:
      "There are 10 types of people in this world: those who understand binary, and those who don't.",
  },
  { cat: "Unknown Category", quote: "Just a random quote." },
];

console.log("=== Category Engine Test ===");
testCases.forEach((tc) => {
  const result = resolveCategoryConfig(tc.cat, tc.quote);
  console.log(`\n--- Quote Category: ${tc.cat} ---`);
  console.log(`Quote Text: "${tc.quote}"`);
  console.log(JSON.stringify(result, null, 2));
});
