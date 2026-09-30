const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");
const logger = require("../config/logger");

/**
 * Composites the final video from multiple clips with subtle motion, audio ducking, and localized overlays.
 */
function composeVideo({
  clips, // Array of { path, duration, motion }
  bgMusic,
  voiceover,
  assFile,
  duration,
  captionStyle,
  outputPath,
}) {
  logger.info(
    `[COMPOSER] Starting multi-clip composition (Duration: ${duration}s, Clips: ${clips.length})...`,
  );

  return new Promise((resolve, reject) => {
    // Escape path for filter
    const relativeAss = path.relative(process.cwd(), assFile).replace(/\\/g, "/");
    const escapedAss = relativeAss.replace(/:/g, "\\\\:");

    const command = ffmpeg();
    
    // Add all video clips, looped so we can trim exactly
    clips.forEach(clip => {
      command.input(clip.path).inputOptions(["-stream_loop", "-1"]);
    });
    
    let audioInputs = 0;
    let musicInputIndex = -1;
    let voiceInputIndex = -1;

    if (bgMusic) {
      command.input(bgMusic).inputOptions(["-stream_loop", "-1"]);
      musicInputIndex = clips.length;
      audioInputs++;
    }

    if (voiceover) {
      command.input(voiceover);
      voiceInputIndex = clips.length + (bgMusic ? 1 : 0);
      audioInputs++;
    }

    const filters = [];
    const concatInputs = [];

    // 1. Process each clip: scale, crop, apply motion (zoompan), trim, reset timestamps
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      const frames = Math.ceil(clip.duration * 30);
      // Use zoompan for zoom_in and zoom_out because crop cannot animate width/height
      if (clip.motion === "zoom_in") {
        filters.push(`[${i}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='min(zoom+0.0015,1.5)':d=${frames}:x='iw/2-(iw/zoom)/2':y='ih/2-(ih/zoom)/2':fps=30:s=1080x1920,setsar=1,trim=duration=${clip.duration},setpts=PTS-STARTPTS[v${i}]`);
      } else if (clip.motion === "zoom_out") {
        filters.push(`[${i}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,zoompan=z='max(1, 1.5-0.0015*on)':d=${frames}:x='iw/2-(iw/zoom)/2':y='ih/2-(ih/zoom)/2':fps=30:s=1080x1920,setsar=1,trim=duration=${clip.duration},setpts=PTS-STARTPTS[v${i}]`);
      } else if (clip.motion === "pan_left") {
        filters.push(`[${i}:v]scale=1200:1920:force_original_aspect_ratio=increase,crop=1080:1920:'max(0,(iw-ow)-t*20)':'(ih-oh)/2',fps=30,setsar=1,trim=duration=${clip.duration},setpts=PTS-STARTPTS[v${i}]`);
      } else if (clip.motion === "pan_right") {
        filters.push(`[${i}:v]scale=1200:1920:force_original_aspect_ratio=increase,crop=1080:1920:'min(iw-ow,t*20)':'(ih-oh)/2',fps=30,setsar=1,trim=duration=${clip.duration},setpts=PTS-STARTPTS[v${i}]`);
      } else {
        filters.push(`[${i}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1,trim=duration=${clip.duration},setpts=PTS-STARTPTS[v${i}]`);
      }
      concatInputs.push(`[v${i}]`);
    }

    // 2. Concatenate all processed clips
    if (clips.length > 1) {
      filters.push(`${concatInputs.join('')}concat=n=${clips.length}:v=1:a=0[concated]`);
    } else {
      // If only one clip, just map it directly
      filters.push(`[v0]null[concated]`);
    }

    // Apply contrast/saturation pop, and subtitles + global fade-out
    filters.push(`[concated]eq=contrast=1.1:saturation=1.15[graded]`);
    filters.push(`[graded]ass=${escapedAss},fade=t=out:st=${duration - 0.5}:d=0.5[v_out]`);

    // 4. Audio Mixing (Ducking) + Global Audio Fade Out
    if (bgMusic && voiceover) {
      filters.push(`[${musicInputIndex}:a]volume=0.3,aresample=48000,aformat=channel_layouts=stereo[music_vol]`);
      // We must use asplit because sidechaincompress consumes the sidechain input
      filters.push(`[${voiceInputIndex}:a]volume=1.2,aresample=48000,aformat=channel_layouts=stereo,asplit=2[voice_vol_sc][voice_vol_mix]`);
      filters.push(`[music_vol][voice_vol_sc]sidechaincompress=threshold=0.03:ratio=4:attack=50:release=300[ducked_music]`);
      filters.push(`[ducked_music][voice_vol_mix]amix=inputs=2:duration=first:dropout_transition=2,afade=t=out:st=${Math.max(0, duration - 2)}:d=2[a_out]`);
    } else if (bgMusic) {
      filters.push(`[${musicInputIndex}:a]volume=0.12,afade=t=out:st=${Math.max(0, duration - 2)}:d=2[a_out]`);
    } else if (voiceover) {
      filters.push(`[${voiceInputIndex}:a]volume=1.2,afade=t=out:st=${Math.max(0, duration - 2)}:d=2[a_out]`);
    }

    command.complexFilter(filters);

    if (audioInputs > 0) {
      command.outputOptions(["-map [v_out]", "-map [a_out]"]);
    } else {
      command.outputOptions(["-map [v_out]"]);
    }

    command
      .outputOptions([
        "-c:v libx264",
        "-preset fast",
        "-crf 23",
        "-c:a aac",
        "-b:a 128k",
        "-pix_fmt yuv420p",
        "-r 30",
        `-t ${duration}`,
      ])
      .save(outputPath)
      .on("start", (cmd) => {
        logger.info(`[COMPOSER] FFmpeg process started`);
      })
      .on("end", () => {
        logger.info(`[COMPOSER] Render completed successfully at ${outputPath}`);
        resolve(outputPath);
      })
      .on("error", (err, stdout, stderr) => {
        logger.error(`[COMPOSER] FFmpeg error: ${err.message}`);
        if (stderr) logger.error(`[COMPOSER] FFmpeg stderr: ${stderr}`);
        reject(err);
      });
  });
}

module.exports = {
  composeVideo,
};
