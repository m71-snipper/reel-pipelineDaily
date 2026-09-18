const fs = require("fs");
const path = require("path");
const logger = require("../config/logger");

const { selectEligibleQuote } = require("../firebase/quoteRepository");
const {
  finalizeReelGeneration,
  markGenerationFailed,
} = require("../firebase/jobRepository");
const { resolveCategoryConfig } = require("../config/categories");
const { getVideoForBeat, clearSeenVideos } = require("../providers/pexels");
const { getBackgroundMusic } = require("../providers/jamendo");
const { generateSpeech } = require("../providers/edgeTts");
const { getWordAlignment } = require("../subtitles/alignment");
const { groupCaptions } = require("../subtitles/captions");
const { generateAssFile } = require("../subtitles/renderer");
const { composeVideo } = require("../video/composer");
const { validateReel, validatePreRender } = require("./validate");
const { generateStoryboard } = require("./storyboard");

async function ensureDirs() {
  const dirs = ["temp", "output"];
  for (const d of dirs) {
    const full = path.join(process.cwd(), d);
    if (!fs.existsSync(full)) {
      fs.mkdirSync(full);
    }
  }
}

async function runPipeline() {
  await ensureDirs();
  const sessionId = Date.now().toString();
  const tempDir = path.join(process.cwd(), "temp");
  const outDir = path.join(process.cwd(), "output");

  let quote = null;
  const tempFiles = [];

  try {
    // 1. Fetch Quote
    quote = await selectEligibleQuote();
    if (!quote) {
      logger.info("[PIPELINE] No quotes to process.");
      return;
    }
    logger.info(`[PIPELINE] Quote selected: ${quote.quote_id}`);
    logger.info(`[PIPELINE] Category: ${quote.category}`);

    // 2. Resolve Config
    const config = resolveCategoryConfig(quote.category, quote.quote);

    // 3. TTS Voiceover & Alignment
    const ttsAudioPath = path.join(tempDir, `tts_${sessionId}.mp3`);
    const ttsSrtPath = path.join(tempDir, `tts_${sessionId}.vtt`);
    tempFiles.push(ttsAudioPath, ttsSrtPath);

    await generateSpeech({
      text: quote.quote,
      voice: config.tts.voice,
      rate: config.tts.rate,
      outputPath: ttsAudioPath,
      srtPath: ttsSrtPath,
    });

    const words = await getWordAlignment(ttsAudioPath, quote.quote, ttsSrtPath);

    // 4. Generate Storyboard
    const beats = generateStoryboard(words, config);
    if (beats.length === 0) {
      throw new Error("Storyboard generation failed (no beats).");
    }

    // Determine target duration
    const ffmpeg = require("fluent-ffmpeg");
    const util = require("util");
    const ffprobe = util.promisify(ffmpeg.ffprobe);
    let ttsDuration = 0;
    try {
      const meta = await ffprobe(ttsAudioPath);
      ttsDuration = meta.format.duration;
    } catch (e) {
      ttsDuration = beats[beats.length - 1].end;
    }
    const targetDuration = Math.max(9, ttsDuration + 1.5);
    
    // Adjust last beat duration so sum of beats covers targetDuration
    const lastBeat = beats[beats.length - 1];
    if (lastBeat.end < targetDuration) {
      lastBeat.duration += (targetDuration - lastBeat.end);
      lastBeat.end = targetDuration;
    }

    // Pre-Render Validation
    if (!validatePreRender(beats, targetDuration)) {
      throw new Error("Pre-render validation failed.");
    }

    // 5. Fetch Visuals (Multi-Clip)
    clearSeenVideos(); // Reset per reel
    const clips = [];
    for (let i = 0; i < beats.length; i++) {
      const beat = beats[i];
      const clipPath = path.join(tempDir, `clip_${sessionId}_${i}.mp4`);
      
      const pexelsData = await getVideoForBeat(
        beat.visualQuery,
        clipPath,
        beat.duration
      );
      
      clips.push({
        path: pexelsData.path,
        duration: beat.duration,
        motion: beat.motion
      });
      tempFiles.push(pexelsData.path);
    }

    // 6. Jamendo Music
    const bgMusicPath = path.join(tempDir, `music_${sessionId}.mp3`);
    tempFiles.push(bgMusicPath);
    await getBackgroundMusic(config.musicTag, bgMusicPath);

    // 7. Captions
    const captionLines = groupCaptions(words, config.captionStyle);

    // 8. Renderer (ASS)
    const assPath = path.join(tempDir, `subs_${sessionId}.ass`);
    tempFiles.push(assPath);
    generateAssFile(captionLines, assPath, config.captionStyle, quote.author);

    // 9. Composer
    const finalOutputPath = path.join(outDir, `reel_${quote.quote_id}.mp4`);
    await composeVideo({
      clips: clips,
      bgMusic: bgMusicPath,
      voiceover: ttsAudioPath,
      assFile: assPath,
      duration: targetDuration,
      captionStyle: config.captionStyle,
      outputPath: finalOutputPath,
    });

    // 10. Validation
    const isValid = await validateReel(finalOutputPath);
    if (!isValid) {
      throw new Error("Video validation failed.");
    }

    // 11. Finalization
    const metadata = {
      reel_id: `reel_${quote.quote_id}`,
      video_path: finalOutputPath,
      pexels_query: config.pexelsQuery, // keeping for backwards compatibility
      clips_count: clips.length,
      music_tag: config.musicTag,
      tts_provider: "edge",
      status: "GENERATED",
    };

    await finalizeReelGeneration(quote.firestoreDocId, metadata);

    logger.info(`[PIPELINE] Reel successfully generated at ${finalOutputPath}`);

    // Clean temp files or preserve them if DEBUG_MODE is on
    if (process.env.DEBUG_MODE === "true") {
      logger.info("[DEBUG] DEBUG_MODE is true. Preserving temp files and dumping rich artifacts.");
      const debugDir = path.join(outDir, `debug_${quote.firestoreDocId}`);
      if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir);

      // Dump Storyboard
      fs.writeFileSync(path.join(debugDir, "storyboard.json"), JSON.stringify(beats, null, 2));
      
      // Dump Alignment
      fs.writeFileSync(path.join(debugDir, "alignment.json"), JSON.stringify(words, null, 2));
      
      // Dump Music Info
      fs.writeFileSync(path.join(debugDir, "music.json"), JSON.stringify({ bgMusicPath, musicTag: config.musicTag }, null, 2));

      // Copy ASS file
      if (fs.existsSync(assPath)) {
        fs.copyFileSync(assPath, path.join(debugDir, "captions.ass"));
      }

      logger.info(`[DEBUG] Dumped rich debug artifacts to ${debugDir}`);
    } else {
      tempFiles.forEach(f => {
        if (fs.existsSync(f)) {
          fs.unlinkSync(f);
        }
      });
    }

  } catch (error) {
    logger.error(`[PIPELINE] Fatal error: ${error.message}`);
    if (quote) {
      await markGenerationFailed(quote.firestoreDocId, error.message).catch(() => {});
    }
  }
}

module.exports = {
  runPipeline,
};
