const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data");
const logger = require("../config/logger");

const PAGE_TOKEN = process.env.FB_PAGE_TOKEN;
const GRAPH_API_VERSION = "v19.0";
const BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Temporarily hosts a local file to get a public URL (required for Instagram API).
 */
async function uploadToTempHost(filePath) {
  logger.info(
    "[META] Uploading video to temporary host (catbox.moe) to generate public URL for Instagram...",
  );
  const formData = new FormData();
  formData.append("reqtype", "fileupload");
  formData.append("fileToUpload", fs.createReadStream(filePath));

  const response = await axios.post(
    "https://catbox.moe/user/api.php",
    formData,
    {
      headers: formData.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    },
  );

  const directUrl = response.data.trim();
  if (!directUrl.startsWith("http")) {
    throw new Error(`Failed to upload to temp host. Response: ${directUrl}`);
  }

  logger.info(`[META] Temporary public URL generated: ${directUrl}`);
  return directUrl;
}

/**
 * Fetches the Facebook Page ID and associated Instagram Business Account ID.
 */
async function getAccountIds() {
  const res = await axios.get(
    `${BASE_URL}/me?fields=id,instagram_business_account&access_token=${PAGE_TOKEN}`,
  );
  const pageId = res.data.id;
  const igUserId = res.data.instagram_business_account
    ? res.data.instagram_business_account.id
    : null;
  return { pageId, igUserId };
}

/**
 * Polls Instagram media creation status until FINISHED.
 */
async function waitForIgProcessing(igUserId, creationId, maxAttempts = 15) {
  for (let i = 0; i < maxAttempts; i++) {
    logger.info(
      `[META] Checking Instagram processing status (Attempt ${i + 1}/${maxAttempts})...`,
    );
    const res = await axios.get(
      `${BASE_URL}/${creationId}?fields=status_code&access_token=${PAGE_TOKEN}`,
    );
    const status = res.data.status_code;

    if (status === "FINISHED") return true;
    if (status === "ERROR") throw new Error("Instagram processing failed.");

    // Wait 10 seconds before polling again
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }
  throw new Error("Instagram processing timed out.");
}

/**
 * Generic retry wrapper for Meta APIs.
 */
async function withRetry(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      logger.warn(`[META] API failed: ${err.message}. Retrying in 5s... (${i+1}/${maxRetries-1})`);
      await new Promise(res => setTimeout(res, 5000));
    }
  }
}

/**
 * Publishes a Reel to Instagram.
 */
async function publishToInstagram(videoPath, caption) {
  if (!PAGE_TOKEN) throw new Error("FB_PAGE_TOKEN is missing");

  try {
    logger.info("[META] Starting Instagram Publishing Flow...");
    const { igUserId } = await withRetry(() => getAccountIds());

    if (!igUserId) {
      throw new Error(
        "No Instagram Business Account linked to this Facebook Page.",
      );
    }

    const publicVideoUrl = await withRetry(() => uploadToTempHost(videoPath));

    logger.info("[META] Creating Instagram media container...");
    const createRes = await withRetry(() => axios.post(`${BASE_URL}/${igUserId}/media`, null, {
      params: {
        media_type: "REELS",
        video_url: publicVideoUrl,
        caption: caption,
        access_token: PAGE_TOKEN,
      },
    }));
    const creationId = createRes.data.id;

    await waitForIgProcessing(igUserId, creationId);

    logger.info("[META] Publishing Instagram media container...");
    const publishRes = await withRetry(() => axios.post(
      `${BASE_URL}/${igUserId}/media_publish`,
      null,
      {
        params: {
          creation_id: creationId,
          access_token: PAGE_TOKEN,
        },
      },
    ));

    logger.info(`[META] Instagram Reel Published! ID: ${publishRes.data.id}`);
    return publishRes.data.id;
  } catch (error) {
    logger.error(`[META] Instagram Publishing Error: ${error.message}`);
    if (error.response) logger.error(JSON.stringify(error.response.data));
    throw error;
  }
}

/**
 * Publishes a Reel to the Facebook Page using the Reels API.
 */
async function publishToFacebook(videoPath, caption) {
  if (!PAGE_TOKEN) throw new Error("FB_PAGE_TOKEN is missing");

  try {
    logger.info("[META] Starting Facebook Reels Publishing Flow...");
    const { pageId } = await withRetry(() => getAccountIds());

    // 1. Initialize Upload
    logger.info("[META] Initializing Facebook Video Upload...");
    const initRes = await withRetry(() => axios.post(
      `${BASE_URL}/${pageId}/video_reels`,
      null,
      {
        params: {
          upload_phase: "start",
          access_token: PAGE_TOKEN,
        },
      },
    ));
    const videoId = initRes.data.video_id;

    // 2. Upload binary
    logger.info(`[META] Uploading binary data for FB Reel ID: ${videoId}...`);
    await withRetry(() => {
      const fileStream = fs.createReadStream(videoPath);
      return axios.post(
        `https://rupload.facebook.com/video-upload/${GRAPH_API_VERSION}/${videoId}`,
        fileStream,
        {
          headers: {
            Authorization: `OAuth ${PAGE_TOKEN}`,
            offset: "0",
            file_size: fs.statSync(videoPath).size,
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        },
      );
    });

    // 3. Finish Upload & Publish
    logger.info("[META] Finishing upload and publishing to Facebook...");
    const finishRes = await withRetry(() => axios.post(
      `${BASE_URL}/${pageId}/video_reels`,
      null,
      {
        params: {
          upload_phase: "finish",
          video_id: videoId,
          video_state: "PUBLISHED",
          description: caption,
          access_token: PAGE_TOKEN,
        },
      },
    ));

    if (finishRes.data.success) {
      logger.info(`[META] Facebook Reel Published! Video ID: ${videoId}`);
      return videoId;
    } else {
      throw new Error("Facebook finish phase failed to return success.");
    }
  } catch (error) {
    logger.error(`[META] Facebook Publishing Error: ${error.message}`);
    if (error.response) logger.error(JSON.stringify(error.response.data));
    throw error;
  }
}

module.exports = {
  publishToInstagram,
  publishToFacebook,
};
