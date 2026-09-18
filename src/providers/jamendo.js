const axios = require("axios");
const fs = require("fs");
const logger = require("../config/logger");

const JAMENDO_API = "https://api.jamendo.com/v3.0/tracks/";

let seenTrackIds = new Set();

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function downloadAudio(url, outputPath) {
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

const SOUNDHELIX_URLS = {
  epic: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
  workout: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
  quirky: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3",
  ambient: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
  default: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
};

/**
 * Fallback to a safe free audio file if Jamendo fails or is unconfigured.
 */
async function useFallbackMusic(tag, outputPath) {
  logger.warn(
    "[JAMENDO] Using fallback SoundHelix music due to missing credentials or API failure.",
  );

  const url = SOUNDHELIX_URLS[tag] || SOUNDHELIX_URLS["default"];
  await downloadAudio(url, outputPath);

  return {
    trackId: "soundhelix_fallback",
    path: outputPath,
    author: "SoundHelix",
  };
}

async function getBackgroundMusic(tag, outputPath, retries = 2) {
  if (!process.env.JAMENDO_CLIENT_ID) {
    logger.warn("[JAMENDO] JAMENDO_CLIENT_ID is missing.");
    return await useFallbackMusic(tag, outputPath);
  }

  logger.info(`[JAMENDO] Searching for music with tag: "${tag}"`);

  try {
    const response = await axios.get(JAMENDO_API, {
      params: {
        client_id: process.env.JAMENDO_CLIENT_ID,
        format: "json",
        limit: 30,
        tags: tag,
        audioformat: "mp32",
        vocalinstrumental: "instrumental",
      },
      timeout: 10000,
    });

    let tracks = response.data.results;
    if (!tracks || tracks.length === 0) {
      logger.warn(`[JAMENDO] No tracks found for tag: "${tag}".`);
      if (retries > 0) {
        logger.info(`[JAMENDO] Retrying... (${retries} left)`);
        await delay(2000);
        return getBackgroundMusic(tag, outputPath, retries - 1);
      }
      return useFallbackMusic(tag, outputPath);
    }

    // Filter and score tracks
    // Prefer tracks >= 15s to ensure enough duration, but penalize overly long tracks
    const validTracks = tracks.filter(t => t.duration >= 15);
    if (validTracks.length > 0) {
      tracks = validTracks;
    }

    // Score tracks based on duration suitability and whether we've seen them
    const scoredTracks = tracks.map(t => {
      let score = 0;
      
      if (!seenTrackIds.has(t.id)) {
        score += 20; // Big bonus for novel tracks
      }
      
      // Prefer tracks between 20s and 60s
      if (t.duration >= 20 && t.duration <= 60) {
        score += 10;
      } else if (t.duration > 60) {
        score -= Math.floor((t.duration - 60) / 10); // Penalty for very long tracks
      }
      
      return { track: t, score };
    });

    scoredTracks.sort((a, b) => b.score - a.score);
    const topTrack = scoredTracks[0].track;
    seenTrackIds.add(topTrack.id);

    const audioUrl = topTrack.audiodownload || topTrack.audio;

    if (!audioUrl) {
      throw new Error("Track has no audio URL");
    }

    logger.info(
      `[JAMENDO] Selected track ID: ${topTrack.id} by ${topTrack.artist_name} (Score: ${scoredTracks[0].score})`,
    );

    await downloadAudio(audioUrl, outputPath);

    if (!validateFile(outputPath)) {
      throw new Error("Downloaded audio is invalid or 0 bytes.");
    }

    logger.info(`[JAMENDO] Music downloaded successfully to: ${outputPath}`);
    return {
      trackId: topTrack.id,
      path: outputPath,
      author: topTrack.artist_name,
    };
  } catch (error) {
    logger.error(
      `[JAMENDO] Error fetching music for tag "${tag}": ${error.message}`,
    );

    if (retries > 0) {
      logger.info(`[JAMENDO] Retrying... (${retries} retries left)`);
      await delay(2000);
      return getBackgroundMusic(tag, outputPath, retries - 1);
    }

    return await useFallbackMusic(tag, outputPath);
  }
}

module.exports = {
  getBackgroundMusic,
};
