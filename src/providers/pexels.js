const axios = require("axios");
const fs = require("fs");
const path = require("path");
const logger = require("../config/logger");

const PEXELS_API = "https://api.pexels.com/videos/search";
const CACHE_PATH = path.join(process.cwd(), "temp", "pexels_cache.json");

let seenVideoIds = new Set();
let lastVideoTags = new Set();

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCache() {
  if (fs.existsSync(CACHE_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"));
    } catch (e) {
      return {};
    }
  }
  return {};
}

function saveCache(cache) {
  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
  } catch (e) {
    logger.warn("[PEXELS] Failed to save cache");
  }
}

/**
 * Downloads a video from URL to a local path.
 */
async function downloadVideo(url, outputPath) {
  const writer = fs.createWriteStream(outputPath);

  const response = await axios({
    url,
    method: "GET",
    responseType: "stream",
    timeout: 30000,
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", (err) => {
      fs.unlink(outputPath, () => {});
      reject(err);
    });
  });
}

function validateFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const stats = fs.statSync(filePath);
  return stats.size > 1024;
}

function clearSeenVideos() {
  seenVideoIds.clear();
  lastVideoTags.clear();
}

/**
 * Fetch and download a suitable Pexels video for a specific beat.
 */
async function getVideoForBeat(query, outputPath, minDuration, retries = 2) {
  if (!process.env.PEXELS_API_KEY) {
    logger.warn("[PEXELS] PEXELS_API_KEY is missing. Using mock video.");
    fs.writeFileSync(outputPath, "mock video content");
    return { videoId: "mock_" + Date.now(), path: outputPath, author: "Mock Author" };
  }

  logger.info(`[PEXELS] Searching for beat video: "${query}" (Min Duration: ${minDuration}s)`);

  try {
    let videos = [];
    const cache = getCache();

    if (cache[query]) {
      logger.info(`[PEXELS] Cache hit for query: "${query}"`);
      videos = cache[query];
    } else {
      const response = await axios.get(PEXELS_API, {
        headers: { Authorization: process.env.PEXELS_API_KEY },
        params: { query: query, orientation: "portrait", size: "medium", per_page: 30 },
        timeout: 10000,
      });

      videos = response.data.videos;
      if (videos && videos.length > 0) {
        cache[query] = videos;
        saveCache(cache);
      }
    }

    if (!videos || videos.length === 0) {
      logger.warn(`[PEXELS] No videos found for query: "${query}".`);
      if (retries > 0) {
        const simpleQuery = query.split(" ")[0];
        return getVideoForBeat(simpleQuery, outputPath, minDuration, retries - 1);
      }
      throw new Error("No videos found.");
    }

    // Score and filter candidates
    // Prefer portrait, longer than minDuration, and not seen before
    let candidates = videos.filter(v => !seenVideoIds.has(v.id));

    if (candidates.length === 0) {
      logger.warn("[PEXELS] Ran out of unique videos. Re-using seen videos.");
      candidates = videos;
    }

    // Assign a score to each candidate
    const scoredCandidates = candidates.map(v => {
      let score = 0;
      
      // Duration Score (Max 10): Prefer clips that cover minDuration but aren't excessively long
      if (v.duration >= minDuration) {
        score += 10;
        // Small penalty for being way too long (e.g., > 30s for a 5s beat) to prefer tighter clips
        if (v.duration > minDuration + 15) {
          score -= 2;
        }
      } else {
        // Penalty for being too short
        score -= 10;
      }

      // Resolution/Portrait Score (Max 15)
      if (v.width && v.height) {
        if (v.height > v.width) {
          score += 5; // Portrait bonus
        }
        if (v.width >= 720 || v.height >= 1280) {
          score += 10; // High-res bonus
        }
      }
      
      // Visual Diversity Score: Penalize if it shares tags with the last video
      if (v.url) {
        // Pexels URLs look like: https://www.pexels.com/video/woman-running-on-beach-12345/
        const urlMatch = v.url.match(/\/video\/([a-z0-9-]+)-\d+\/?$/);
        if (urlMatch) {
          const tags = urlMatch[1].split('-');
          v.extractedTags = tags; // Save for later
          const sharedTags = tags.filter(tag => lastVideoTags.has(tag));
          if (sharedTags.length > 0) {
            score -= 5 * sharedTags.length; // Heavy penalty for semantic repetition
          }
        }
      }
      
      return { video: v, score };
    });

    // Sort descending by score
    scoredCandidates.sort((a, b) => b.score - a.score);
    
    const topCandidate = scoredCandidates[0].video;
    logger.info(`[PEXELS] Top candidates scores: ${scoredCandidates.slice(0, 3).map(c => `${c.video.id}(${c.score})`).join(', ')}`);

    seenVideoIds.add(topCandidate.id);
    if (topCandidate.extractedTags) {
      lastVideoTags = new Set(topCandidate.extractedTags);
    } else {
      lastVideoTags.clear();
    }

    // Pick highest quality portrait file
    const videoFiles = topCandidate.video_files.sort((a, b) => (b.width * b.height) - (a.width * a.height));
    let chosenFile = videoFiles.find(f => f.width >= 720 && f.height >= 1280) || videoFiles[0];

    logger.info(`[PEXELS] Selected video ID: ${topCandidate.id} for beat.`);

    await downloadVideo(chosenFile.link, outputPath);

    if (!validateFile(outputPath)) {
      throw new Error("Downloaded file is invalid.");
    }

    return {
      videoId: topCandidate.id,
      path: outputPath,
      author: topCandidate.user.name,
      duration: topCandidate.duration
    };

  } catch (error) {
    logger.error(`[PEXELS] Error fetching video: ${error.message}`);
    if (retries > 0) {
      await delay(2000);
      const fallbackQuery = query.split(" ")[0];
      return getVideoForBeat(fallbackQuery, outputPath, minDuration, retries - 1);
    }
    throw error;
  }
}

/**
 * Backward compatibility for older uses
 */
async function getBackgroundVideo(query, outputPath, retries = 2) {
  return getVideoForBeat(query, outputPath, 0, retries);
}

module.exports = {
  getVideoForBeat,
  getBackgroundVideo,
  clearSeenVideos
};
