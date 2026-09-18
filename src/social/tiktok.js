const fs = require("fs");
const axios = require("axios");
const { db } = require("../config/firebase");
const logger = require("../config/logger");

const CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
const CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;

/**
 * Retrieves valid TikTok tokens from Firestore, refreshing them if necessary.
 */
async function getValidTokens() {
  const docRef = db.collection("system_config").doc("tiktok_auth");
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new Error(
      "TikTok auth tokens not found in Firestore or .env. Please configure them first.",
    );
  }

  const data = doc.data();
  const now = Date.now();

  // Add 5 minutes buffer for expiration
  if (data.expires_at && now > data.expires_at - 300000) {
    logger.info(
      "[TIKTOK] Access token expired or expiring soon, refreshing...",
    );

    if (!data.refresh_token) {
      throw new Error("No refresh token available to renew access.");
    }

    if (data.refresh_expires_at && now > data.refresh_expires_at) {
      throw new Error(
        "Refresh token is also expired. Must re-authenticate manually.",
      );
    }

    const params = new URLSearchParams();
    params.append("client_key", CLIENT_KEY);
    params.append("client_secret", CLIENT_SECRET);
    params.append("grant_type", "refresh_token");
    params.append("refresh_token", data.refresh_token);

    const response = await axios.post(
      "https://open.tiktokapis.com/v2/oauth/token/",
      params.toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Cache-Control": "no-cache",
        },
      },
    );

    const refreshData = response.data;
    if (refreshData.error) {
      throw new Error(
        `Token refresh failed: ${refreshData.error_description || refreshData.error}`,
      );
    }

    const expires_in = refreshData.expires_in || 86400;
    const expires_at = Date.now() + expires_in * 1000;

    const refresh_expires_in = refreshData.refresh_expires_in || 31536000;
    const refresh_expires_at = Date.now() + refresh_expires_in * 1000;

    // Save refreshed tokens
    await docRef.set(
      {
        access_token: refreshData.access_token,
        refresh_token: refreshData.refresh_token,
        expires_at: expires_at,
        refresh_expires_at: refresh_expires_at,
        open_id: refreshData.open_id,
        updated_at: new Date().toISOString(),
      },
      { merge: true },
    );

    logger.info("[TIKTOK] Successfully refreshed tokens.");
    return refreshData.access_token;
  }

  return data.access_token;
}

/**
 * Publishes a video to TikTok via the Direct Post API.
 *
 * @param {string} videoPath - Absolute path to the .mp4 file
 * @param {string} caption - The caption/title for the video
 */
async function publishToTikTok(videoPath, caption) {
  throw new Error("TikTok publishing is currently disabled pending business approval.");

  try {
    logger.info(`[TIKTOK] Starting TikTok publish for video: ${videoPath}`);

    // 1. Ensure valid access token
    const accessToken = await getValidTokens();

    // 2. Prepare file stats
    const stats = fs.statSync(videoPath);
    const videoSize = stats.size;

    // We upload the file in one single chunk if it's small, otherwise TikTok expects
    // chunking, but for short reels it should be << 50MB
    const chunkSize = videoSize;

    // 3. Init Video Upload Request
    logger.info("[TIKTOK] Initializing video upload session...");
    const initPayload = {
      post_info: {
        title: caption,
        privacy_level: "SELF_ONLY", // Changed from PUBLIC_TO_EVERYONE for unaudited apps
        disable_comment: false,
        disable_stitch: false,
        video_cover_timestamp_ms: 1000,
      },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: videoSize,
        chunk_size: chunkSize,
        total_chunk_count: 1,
      },
    };

    const initResponse = await axios.post(
      "https://open.tiktokapis.com/v2/post/publish/video/init/",
      initPayload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
      },
    );

    if (initResponse.data.error && initResponse.data.error.code !== "ok") {
      throw new Error(`Init failed: ${initResponse.data.error.message}`);
    }

    const { upload_url, publish_id } = initResponse.data.data;
    if (!upload_url) {
      throw new Error("No upload URL returned from TikTok init call.");
    }

    logger.info(
      `[TIKTOK] Init successful. Publish ID: ${publish_id}. Uploading binary stream...`,
    );

    // 4. Upload binary stream
    const fileStream = fs.createReadStream(videoPath);

    // PUT the file to the upload_url
    await axios.put(upload_url, fileStream, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": videoSize,
        "Content-Range": `bytes 0-${videoSize - 1}/${videoSize}`,
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    logger.info(
      `[TIKTOK] Upload complete! Video successfully submitted for processing. Publish ID: ${publish_id}`,
    );

    return {
      platform: "tiktok",
      publish_id: publish_id,
      status: "PUBLISHED",
    };
  } catch (error) {
    logger.error(`[TIKTOK] Publishing failed: ${error.message}`);
    if (error.response && error.response.data) {
      logger.error(
        `[TIKTOK] Response Data: ${JSON.stringify(error.response.data)}`,
      );
    }
    throw error;
  }
}

module.exports = {
  publishToTikTok,
  getValidTokens,
};
