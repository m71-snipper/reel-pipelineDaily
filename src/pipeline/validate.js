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
async function validateReel(videoPath, outDir) {
  logger.info(`[VALIDATE] Validating reel: ${videoPath}`);

  const report = {
    passed: false,
    score: 100,
    blockingIssues: [],
    warnings: []
  };

  if (!fs.existsSync(videoPath)) {
    report.blockingIssues.push("Video file does not exist.");
    return finalizeReport(report, outDir);
  }

  const stats = fs.statSync(videoPath);
  if (stats.size < 100 * 1024) {
    report.blockingIssues.push(`Video file is suspiciously small (${Math.round(stats.size/1024)}KB < 100KB).`);
  }

  try {
    const metadata = await ffprobe(videoPath);

    // Check streams
    const videoStream = metadata.streams.find((s) => s.codec_type === "video");
    const audioStream = metadata.streams.find((s) => s.codec_type === "audio");

    if (!videoStream) {
      report.blockingIssues.push("No video stream found.");
    } else {
      if (videoStream.codec_name !== "h264") {
        report.blockingIssues.push(`Invalid video codec: ${videoStream.codec_name} (expected h264).`);
      }
      if (videoStream.width !== 1080 || videoStream.height !== 1920) {
        report.blockingIssues.push(`Resolution is ${videoStream.width}x${videoStream.height}, expected 1080x1920.`);
      }
      // Basic framerate check (should be around 30)
      if (videoStream.r_frame_rate) {
        const [num, den] = videoStream.r_frame_rate.split('/');
        const fps = parseInt(num, 10) / (parseInt(den, 10) || 1);
        if (fps < 24 || fps > 35) {
          report.warnings.push(`Unexpected framerate: ${fps} FPS.`);
          report.score -= 5;
        }
      }
    }

    if (!audioStream) {
      report.blockingIssues.push("No audio stream found.");
    } else {
      if (audioStream.codec_name !== "aac") {
        report.blockingIssues.push(`Invalid audio codec: ${audioStream.codec_name} (expected aac).`);
      }
    }

    if (metadata.format.duration < 3) {
      report.blockingIssues.push(`Video duration is too short (${metadata.format.duration}s).`);
    } else if (metadata.format.duration > 60) {
      report.warnings.push(`Video duration is surprisingly long (${metadata.format.duration}s).`);
      report.score -= 10;
    }

  } catch (err) {
    report.blockingIssues.push(`Could not probe video file: ${err.message}`);
  }

  return finalizeReport(report, outDir);
}

function finalizeReport(report, outDir) {
  if (report.blockingIssues.length === 0) {
    report.passed = true;
    logger.info(`[VALIDATE] PASS (Score: ${report.score})`);
  } else {
    logger.error(`[VALIDATE] FAIL: ${report.blockingIssues.join(", ")}`);
  }
  
  if (report.warnings.length > 0) {
    logger.warn(`[VALIDATE] Warnings: ${report.warnings.join(", ")}`);
  }

  if (outDir) {
    const fs = require("fs");
    const path = require("path");
    fs.writeFileSync(path.join(outDir, "quality-report.json"), JSON.stringify(report, null, 2));
  }

  return report;
}

module.exports = {
  validatePreRender,
  validateReel,
};
