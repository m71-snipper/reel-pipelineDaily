require("dotenv").config();
const fs = require("fs");
const path = require("path");
const logger = require("../src/config/logger");
const { publishToTikTok } = require("../src/social/tiktok");
const { publishToFacebook, publishToInstagram } = require("../src/social/meta");

async function testPublish() {
  logger.info("===================================");
  logger.info("[TEST PUBLISH] Starting Multi-Platform Publishing");
  logger.info("===================================");

  // Find the generated reel
  const outputDir = path.join(process.cwd(), "output");
  if (!fs.existsSync(outputDir)) {
    logger.error("Output directory does not exist.");
    return;
  }

  const files = fs.readdirSync(outputDir).filter((f) => f.endsWith(".mp4"));
  if (files.length === 0) {
    logger.error(
      "No generated reels found in output directory. Run test:reel first.",
    );
    return;
  }

  // We'll use the most recently generated reel
  const latestReel = files.sort((a, b) => {
    return (
      fs.statSync(path.join(outputDir, b)).mtime.getTime() -
      fs.statSync(path.join(outputDir, a)).mtime.getTime()
    );
  })[0];

  const videoPath = path.join(outputDir, latestReel);
  const caption =
    "Consistency is key. Keep pushing forward! 💪🔥 #Motivation #Hustle #Gym";

  logger.info(`[TEST PUBLISH] Found reel: ${latestReel}`);

  const isPublishingEnabled = process.env.ENABLE_PUBLISHING === "true";

  if (!isPublishingEnabled) {
    logger.info("[TEST PUBLISH] ENABLE_PUBLISHING is not true. Performing DRY RUN only.");
  }

  try {
    // 1. TikTok
    try {
      logger.info("-----------------------------------");
      if (isPublishingEnabled) {
        await publishToTikTok(videoPath, caption);
      } else {
        logger.info("[DRY RUN] Would have published to TikTok");
      }
    } catch (e) {
      logger.error(`TikTok publish failed: ${e.message}`);
    }

    // 2. Facebook Reels
    try {
      logger.info("-----------------------------------");
      if (isPublishingEnabled) {
        await publishToFacebook(videoPath, caption);
      } else {
        logger.info("[DRY RUN] Would have published to Facebook");
      }
    } catch (e) {
      logger.error(`Facebook publish failed: ${e.message}`);
    }

    // 3. Instagram Reels
    try {
      logger.info("-----------------------------------");
      if (isPublishingEnabled) {
        await publishToInstagram(videoPath, caption);
      } else {
        logger.info("[DRY RUN] Would have published to Instagram");
      }
    } catch (e) {
      logger.error(`Instagram publish failed: ${e.message}`);
    }
  } catch (error) {
    logger.error(`[TEST PUBLISH] Fatal Error: ${error.message}`);
  }

  logger.info("===================================");
  logger.info("[TEST PUBLISH] Publishing Cycle Completed");
  logger.info("===================================");
}

testPublish();
