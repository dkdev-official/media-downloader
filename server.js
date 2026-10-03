const express = require("express");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Public static files
const PUBLIC_DIR = path.join(__dirname, "public");
app.use(express.static(PUBLIC_DIR));

// Downloads directory
const DOWNLOADS_DIR = path.join(__dirname, "downloads");
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

function isValidUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    const host = parsed.hostname.toLowerCase();
    return (
      host.includes("youtube.com") ||
      host.includes("youtu.be") ||
      host.includes("instagram.com")
    );
  } catch (e) {
    return false;
  }
}

app.get("/api/download", (req, res) => {
  const { url, type } = req.query;

  if (!url || !isValidUrl(url)) {
    return res.status(400).send("Invalid URL");
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const outputTemplate = path.join(DOWNLOADS_DIR, "%(title)s.%(ext)s");

  // Common yt-dlp flags for stability on cloud platforms
  let commonArgs = [
    "--no-playlist",
    "--newline",
    "-o",
    outputTemplate,
    url
  ];

  let args = [];
  if (type === "audio") {
    args = [
      "-x",
      "--audio-format",
      "mp3",
      "--audio-quality",
      "0",
      ...commonArgs
    ];
  } else {
    args = [
      "-f",
      "bv*+ba/b",
      "--merge-output-format",
      "mp4",
      ...commonArgs
    ];
  }

  const isWin = process.platform === "win32";
  const ytDlpCmd = isWin ? path.join(__dirname, "yt-dlp.exe") : "yt-dlp";

  const processCmd = spawn(ytDlpCmd, args);

  let errorOutput = "";

  processCmd.stdout.on("data", (data) => {
    const text = data.toString();
    console.log("yt-dlp stdout:", text);

    const percentMatch = text.match(/(\d+(?:\.\d+)?)%/);
    if (percentMatch) {
      sendEvent("progress", { percent: parseFloat(percentMatch[1]) });
    }
  });

  processCmd.stderr.on("data", (data) => {
    const errText = data.toString();
    console.error("yt-dlp stderr:", errText);
    errorOutput += errText;

    const percentMatch = errText.match(/(\d+(?:\.\d+)?)%/);
    if (percentMatch) {
      sendEvent("progress", { percent: parseFloat(percentMatch[1]) });
    }
  });

  processCmd.on("error", (err) => {
    console.error("Failed to start process:", err);
    sendEvent("error", { message: "Failed to start yt-dlp: " + err.message });
    res.end();
  });

  processCmd.on("close", (code) => {
    if (code === 0) {
      sendEvent("complete", { message: "Download completed!" });
    } else {
      sendEvent("error", { message: "Download failed. Check server logs." });
    }
    res.end();
  });

  req.on("close", () => {
    processCmd.kill();
  });
});

app.get("/api/files", (req, res) => {
  fs.readdir(DOWNLOADS_DIR, (err, files) => {
    if (err) return res.status(500).json([]);
    res.json(files);
  });
});

app.use("/downloads", express.static(DOWNLOADS_DIR));

app.get("/", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
