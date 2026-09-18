// ASS colors are in BGR order (AABBGGRR)
// &H00FFFFFF = White
// &H000000FF = Red
// &H0000FFFF = Yellow
// &H0000FF00 = Green

const PRESETS = {
  cinematic: {
    fontName: "Montserrat",
    fontSize: 65,
    primaryColor: "&H00C0C0C0", // Dimmed white (inactive)
    highlightColor: "&H00FFFFFF", // Pure white (active word)
    outlineColor: "&H00000000", // Black
    backColor: "&H80000000", // Semi-transparent black
    bold: 1,
    borderStyle: 1, // Outline and shadow
    outline: 1,
    shadow: 2,
    captionLayout: {
      position: "center",
      marginTop: 240,
      marginBottom: 350,
      maxWidth: 850
    }
  },
  motivational: {
    fontName: "Impact",
    fontSize: 75,
    primaryColor: "&H00FFFFFF", // White
    highlightColor: "&H0000FFFF", // Yellow (active)
    outlineColor: "&H00000000",
    backColor: "&H00000000", // Transparent
    bold: 0,
    borderStyle: 1,
    outline: 3,
    shadow: 3,
    captionLayout: {
      position: "center",
      marginTop: 200,
      marginBottom: 350,
      maxWidth: 900
    }
  },
  tech: {
    fontName: "Courier New",
    fontSize: 60,
    primaryColor: "&H00FFFFFF",
    highlightColor: "&H0000FF00", // Bright Green
    outlineColor: "&H00000000",
    backColor: "&HC0000000", // Dark semi-transparent background box
    bold: 1,
    borderStyle: 3, // Opaque box background
    outline: 0,
    shadow: 0,
    captionLayout: {
      position: "top",
      marginTop: 240,
      marginBottom: 300,
      maxWidth: 950
    }
  },
  stoic: {
    fontName: "Bebas Neue",
    fontSize: 80,
    primaryColor: "&H00A0A0A0", // Gray (inactive)
    highlightColor: "&H00FFFFFF", // Pure white (active)
    outlineColor: "&H00000000",
    backColor: "&H00000000",
    bold: 0,
    borderStyle: 1,
    outline: 2,
    shadow: 1,
    captionLayout: {
      position: "center",
      marginTop: 300,
      marginBottom: 400,
      maxWidth: 900
    }
  },
  default: {
    fontName: "Arial",
    fontSize: 65,
    primaryColor: "&H00FFFFFF",
    highlightColor: "&H0000FFFF",
    outlineColor: "&H00000000",
    backColor: "&H80000000",
    bold: 1,
    borderStyle: 1,
    outline: 1,
    shadow: 2,
    captionLayout: {
      position: "center",
      marginTop: 250,
      marginBottom: 350,
      maxWidth: 900
    }
  }
};

module.exports = {
  PRESETS
};
