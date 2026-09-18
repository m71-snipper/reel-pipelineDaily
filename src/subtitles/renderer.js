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
  const primaryColor = styleConfig.primaryColor || "&H00FFFFFF";
  const highlightColor = styleConfig.highlightColor || "&H0000FFFF";
  const outlineColor = styleConfig.outlineColor || "&H00000000";
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

  const assHeader = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Main,${fontName},${fontSize},${primaryColor},&H000000FF,${outlineColor},${backColor},${bold},0,0,0,100,100,0,0,${borderStyle},${outline},${shadow},${alignment},${marginLR},${marginLR},${marginV},1
Style: Author,${fontName},40,&H00E0E0E0,&H000000FF,${outlineColor},&H00000000,0,1,0,0,100,100,0,0,1,2,2,8,50,50,650,1

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
      const startAss = toAssTime(activeWord.start);
      // Ensure smooth highlighting by bridging gaps between words
      const nextWord = line.words[index + 1];
      const endAss = nextWord ? toAssTime(nextWord.start) : toAssTime(line.end);

      let eventText = "";
      line.words.forEach((w) => {
        if (w === activeWord) {
          eventText += `{\\c${highlightColor}}${w.word}{\\c${primaryColor}} `;
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
    // Align author slightly below center if main is center, or wherever appropriate
    let authorAlignment = 8;
    let authorMarginV = 1100; // default lower third
    if (layout.position === "bottom") authorMarginV = 1500;
    
    // We override alignment/marginV in the event line directly for Author
    assEvents += `Dialogue: 0,${authorStart},${authorEnd},Author,,0,0,0,,{\\pos(540,${authorMarginV})}{\\fad(300,300)}- ${author}\n`;
  }

  const fileContent = assHeader + assEvents;
  fs.writeFileSync(outputPath, fileContent, "utf8");

  logger.info(`[RENDERER] Generated .ass file at ${outputPath}`);
  return outputPath;
}

module.exports = {
  generateAssFile,
};
