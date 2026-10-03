const express = require("express");
const path = require("path");
const fs = require("fs");
const youtubedl = require("youtube-dl-exec");

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

app.get("/api/download", async (req, res) => {
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

  try {
    sendEvent("progress", { percent: 15 });

    let options = {
      noPlaylist: true,
      output: outputTemplate,
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    };

    if (type === "audio") {
      options.extractAudio = true;
      options.audioFormat = "mp3";
      options.audioQuality = "0";
    } else {
      options.format = "bv*+ba/b";
      options.mergeOutputFormat = "mp4";
    }

    sendEvent("progress", { percent: 50 });

    // Download automatically via official binary
    await youtubedl(url, options);

    sendEvent("progress", { percent: 100 });
    sendEvent("complete", { message: "Download completed!" });
  } catch (error) {
    console.error("Download Error:", error);
    sendEvent("error", { message: "Download failed." });
  } finally {
    res.end();
  }
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
