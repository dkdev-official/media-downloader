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

  // Bypass YouTube Cloud Bot Protection (Android Client Fallback)
  let commonArgs = [
    "--no-playlist",
    "--newline",
    "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "--extractor-args", "youtube:player_client=android,web",
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

  processCmd.stdout.on("data", (data) => {
    const text = data.toString();
    const percentMatch = text.match(/(\d+(?:\.\d+)?)%/);
    if (percentMatch) {
      sendEvent("progress", { percent: parseFloat(percentMatch[1]) });
    }
  });

  processCmd.stderr.on("data", (data) => {
    const errText = data.toString();
    const percentMatch = errText.match(/(\d+(?:\.\d+)?)%/);
    if (percentMatch) {
      sendEvent("progress", { percent: parseFloat(percentMatch[1]) });
    }
  });

  processCmd.on("close", (code) => {
    if (code === 0) {
      sendEvent("complete", { message: "Download completed!" });
    } else {
      sendEvent("error", { message: "Download failed." });
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
