const fs = require("fs");
const logger = require("../config/logger");

/**
 * Converts HH:MM:SS.mmm to ASS format H:MM:SS.cc
 */
function toAssTime(seconds) {
  const date = new Date(seconds * 1000);
  const h = Math.floor(seconds / 3600);
  const m = String(date.getUTCMinutes()).padStart(2, "0");
  const s = String(date.getUTCSeconds()).padStart(2, "0");
  const cs = String(Math.floor(date.getUTCMilliseconds() / 10)).padStart(2, "0");
  return `${h}:${m}:${s}.${cs}`;
}

/**
 * Generates an .ass subtitle file for FFmpeg to render, with word-level highlighting.
 */
function generateAssFile(lines, outputPath, styleConfig, author) {
  logger.info("[RENDERER] Generating .ass subtitle file with dynamic highlights...");

  const fontName = styleConfig.fontName || "Arial";
  const fontSize = styleConfig.fontSize || 65;
  const primaryColor = styleConfig.primaryColor || "&HFFFFFF";
  const highlightColor = styleConfig.highlightColor || "&H00FFFF";
  const outlineColor = styleConfig.outlineColor || "&H000000";
  const backColor = styleConfig.backColor || "&H80000000";
  const bold = styleConfig.bold || 0;
  const borderStyle = styleConfig.borderStyle || 1;
  const outline = styleConfig.outline !== undefined ? styleConfig.outline : 1;
  const shadow = styleConfig.shadow !== undefined ? styleConfig.shadow : 2;
  
  const layout = styleConfig.captionLayout || {
    position: "center",
    marginTop: 250,
    marginBottom: 350,
    maxWidth: 900
  };

  let alignment = 5; // default center
  let marginV = 0;
  if (layout.position === "top") {
    alignment = 8;
    marginV = layout.marginTop || 200;
  } else if (layout.position === "bottom") {
    alignment = 2;
    marginV = layout.marginBottom || 300;
  } else {
    alignment = 5;
    // For center, marginV can offset vertically, but usually 0 is true center.
    // If presets specify a marginV for center, we can use it to slightly push up/down,
    // though ASS center alignment ignores it in some renderers.
    marginV = 0; 
  }

  // Calculate side margins for max width
  // Assuming 1080px wide canvas
  const marginLR = Math.max(0, Math.floor((1080 - (layout.maxWidth || 900)) / 2));

  // Build Watermark Style dynamically
  let watermarkStyle = "";
  if (process.env.WATERMARK_ENABLED !== "false") {
    const wmOpacity = parseFloat(process.env.WATERMARK_OPACITY || "0.65");
    const alphaHex = Math.round((1 - wmOpacity) * 255).toString(16).padStart(2, "0").toUpperCase();
    const wmMarginTop = parseInt(process.env.WATERMARK_MARGIN_TOP || "90", 10);
    const wmMarginRight = parseInt(process.env.WATERMARK_MARGIN_RIGHT || "50", 10);
    
    // Style: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, ... Alignment (9 = top right), MarginL, MarginR, MarginV
    watermarkStyle = `Style: Watermark,Arial,40,&H${alphaHex}FFFFFF,&H000000FF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,1,1,9,50,${wmMarginRight},${wmMarginTop},1`;
  }

  const assHeader = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Main,${fontName},${fontSize},${primaryColor},&H000000FF,${outlineColor},${backColor},${bold},0,0,0,100,100,0,0,${borderStyle},${outline},${shadow},${alignment},${marginLR},${marginLR},${marginV},1
Style: Author,${fontName},40,&H00E0E0E0,&H000000FF,${outlineColor},&H00000000,0,1,0,0,100,100,0,0,1,2,2,8,50,50,650,1
${watermarkStyle}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  let assEvents = "";

  // Add the dynamic captions
  lines.forEach((line) => {
    // If we only have plain text without words alignment array (fallback)
    if (!line.words || line.words.length === 0) {
      const startAss = toAssTime(line.start);
      const endAss = toAssTime(line.end);
      const text = line.text.replace(/\n/g, "\\N");
      assEvents += `Dialogue: 0,${startAss},${endAss},Main,,0,0,0,,${text}\n`;
      return;
    }

    // Word-level highlighting
    line.words.forEach((activeWord, index) => {
      let startTime = activeWord.start;
      let nextTime = line.words[index + 1] ? line.words[index + 1].start : line.end;
      
      // Human perception offset: highlight appears slightly before the word is spoken
      startTime = Math.max(0, startTime - 0.03);

      // Fix for Whisper assigning identical timestamps to fast spoken words (prevents 0-duration freeze on Linux libass)
      if (nextTime <= startTime) {
        nextTime = startTime + 0.1;
      }

      // Frame quantize (30fps) to eliminate 1-frame flickering
      startTime = Math.round(startTime * 30) / 30;
      nextTime = Math.round(nextTime * 30) / 30;

      const startAss = toAssTime(startTime);
      const endAss = toAssTime(nextTime);

      let eventText = "";
      line.words.forEach((w) => {
        if (w === activeWord) {
          // Use standard ASS format with trailing & to prevent parser freeze on strict libass versions
          eventText += `{\\1c${highlightColor}&}${w.word}{\\1c${primaryColor}&} `;
        } else {
          eventText += `${w.word} `;
        }
      });

      eventText = eventText.trim().replace(/\n/g, "\\N");
      assEvents += `Dialogue: 0,${startAss},${endAss},Main,,0,0,0,,${eventText}\n`;
    });
  });

  // Add the author (appears after first few seconds, stays till end)
  if (author && lines.length > 0) {
    const firstLineEnd = Math.min(2.0, lines[lines.length - 1].end);
    const authorStart = toAssTime(firstLineEnd);
    const authorEnd = toAssTime(lines[lines.length - 1].end);
    // Align author at the bottom third to avoid clashing with center captions
    let authorMarginV = 1600; 
    if (layout.position === "bottom") authorMarginV = 1700;
    
    // We override alignment/marginV in the event line directly for Author
    assEvents += `Dialogue: 0,${authorStart},${authorEnd},Author,,0,0,0,,{\\pos(540,${authorMarginV})}{\\fad(300,300)}- ${author}\n`;
  }

  // Add watermark
  if (process.env.WATERMARK_ENABLED !== "false") {
    const brandingText = process.env.WATERMARK_TEXT || process.env.BRANDING_TEXT || "@SuperNeuron";
    if (brandingText) {
      const endAss = lines.length > 0 ? toAssTime(Math.max(60, lines[lines.length-1].end + 10)) : "0:01:00.00";
      assEvents += `Dialogue: 0,0:00:00.00,${endAss},Watermark,,0,0,0,,${brandingText}\n`;
    }
  }

  const fileContent = assHeader + assEvents;
  fs.writeFileSync(outputPath, fileContent, "utf8");

  logger.info(`[RENDERER] Generated .ass file at ${outputPath}`);
  return outputPath;
}

module.exports = {
  generateAssFile,
};
