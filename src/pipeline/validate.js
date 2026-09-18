const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
const util = require("util");
const logger = require("../config/logger");

const ffprobe = util.promisify(ffmpeg.ffprobe);

/**
 * Pre-render validation before starting FFmpeg.
 */
function validatePreRender(beats, minExpectedDuration) {
  logger.info("[VALIDATE] Running pre-render validation...");
  
  if (!beats || beats.length === 0) {
    logger.error("[VALIDATE] FAIL: Storyboard has no beats.");
    return false;
  }
  
  let totalDuration = 0;
  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i];
    if (!beat.duration || beat.duration <= 0) {
      logger.error(`[VALIDATE] FAIL: Beat ${i} has invalid duration (${beat.duration}).`);
      return false;
    }
    totalDuration += beat.duration;
  }
  
  if (totalDuration < minExpectedDuration - 0.5) {
    logger.error(`[VALIDATE] FAIL: Storyboard duration (${totalDuration}s) is shorter than expected (${minExpectedDuration}s).`);
    return false;
  }
  
  logger.info("[VALIDATE] Pre-render PASS");
  return true;
}

/**
 * Validates the generated video reel.
 */
async function validateReel(videoPath) {
  logger.info(`[VALIDATE] Validating reel: ${videoPath}`);

  if (!fs.existsSync(videoPath)) {
    logger.error("[VALIDATE] FAIL: Video file does not exist.");
    return false;
  }

  const stats = fs.statSync(videoPath);
  if (stats.size < 100 * 1024) {
    logger.error(`[VALIDATE] FAIL: Video file is suspiciously small (${Math.round(stats.size/1024)}KB < 100KB).`);
    return false;
  }

  try {
    const metadata = await ffprobe(videoPath);

    // Check streams
    const videoStream = metadata.streams.find((s) => s.codec_type === "video");
    const audioStream = metadata.streams.find((s) => s.codec_type === "audio");

    if (!videoStream) {
      logger.error("[VALIDATE] FAIL: No video stream found.");
      return false;
    }

    if (videoStream.codec_name !== "h264") {
      logger.error(`[VALIDATE] FAIL: Invalid video codec: ${videoStream.codec_name} (expected h264).`);
      return false;
    }

    if (videoStream.width !== 1080 || videoStream.height !== 1920) {
      logger.error(
        `[VALIDATE] FAIL: Resolution is ${videoStream.width}x${videoStream.height}, expected 1080x1920.`
      );
      return false;
    }

    // Basic framerate check (should be around 30)
    if (videoStream.r_frame_rate) {
      const [num, den] = videoStream.r_frame_rate.split('/');
      const fps = parseInt(num, 10) / (parseInt(den, 10) || 1);
      if (fps < 24 || fps > 35) {
        logger.error(`[VALIDATE] FAIL: Unexpected framerate: ${fps} FPS.`);
        return false;
      }
    }

    if (!audioStream) {
      logger.error("[VALIDATE] FAIL: No audio stream found.");
      return false;
    }

    if (audioStream.codec_name !== "aac") {
      logger.error(`[VALIDATE] FAIL: Invalid audio codec: ${audioStream.codec_name} (expected aac).`);
      return false;
    }

    if (metadata.format.duration < 3) {
      logger.error(
        `[VALIDATE] FAIL: Video duration is too short (${metadata.format.duration}s).`,
      );
      return false;
    }

    logger.info("[VALIDATE] PASS");
    return true;
  } catch (err) {
    logger.error(`[VALIDATE] FAIL: Could not probe video file: ${err.message}`);
    return false;
  }
}

module.exports = {
  validatePreRender,
  validateReel,
};
