const express = require("express");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const app = express();
const PORT = 3000;
const DOWNLOAD_DIR = path.join(__dirname, "downloads");

if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function validURL(value) {
    try {
        const url = new URL(value);
        const allowedHosts = [
            "youtube.com", "www.youtube.com", "youtu.be",
            "m.youtube.com", "instagram.com", "www.instagram.com"
        ];
        return allowedHosts.includes(url.hostname.toLowerCase());
    } catch {
        return false;
    }
}

function runYTDLP(url, type, res) {
    let args = ["--no-playlist", "--newline"];

    if (type === "video" || type === "merged") {
        args.push("-f", "bv*+ba/b", "--merge-output-format", "mp4");
    }

    if (type === "audio") {
        args.push("-x", "--audio-format", "mp3", "--audio-quality", "0");
    }

    args.push("-o", path.join(DOWNLOAD_DIR, "%(title)s.%(ext)s"), url);

    const process = spawn("yt-dlp", args, { windowsHide: true });
    let output = "";

    process.stdout.on("data", data => {
        const text = data.toString();
        output += text;

        for (const line of text.split("\n")) {
            const match = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
            if (match) {
                res.write(`data: ${JSON.stringify({
                    type: "progress",
                    progress: Number(match[1])
                })}\n\n`);
            }
        }
    });

    process.stderr.on("data", data => {
        output += data.toString();
    });

    process.on("error", () => {
        res.write(`data: ${JSON.stringify({
            type: "error",
            message: "yt-dlp start nahi hua. Check karo ki yt-dlp PATH me installed hai."
        })}\n\n`);
        res.end();
    });

    process.on("close", code => {
        if (code !== 0) {
            console.error(output);
            res.write(`data: ${JSON.stringify({
                type: "error",
                message: "Download failed. URL/content availability aur yt-dlp installation check karo."
            })}\n\n`);
        } else {
            res.write(`data: ${JSON.stringify({ type: "complete" })}\n\n`);
        }
        res.end();
    });
}

app.get("/api/download", (req, res) => {
    const { url, type } = req.query;

    if (!url) return res.status(400).json({ error: "URL required" });
    if (!validURL(url)) {
        return res.status(400).json({
            error: "Only supported YouTube/Instagram URLs are allowed."
        });
    }

    if (!["video", "audio", "merged"].includes(type)) {
        return res.status(400).json({ error: "Invalid download type" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    runYTDLP(url, type, res);
});

app.get("/api/files", (req, res) => {
    fs.readdir(DOWNLOAD_DIR, (err, files) => {
        if (err) return res.status(500).json({ error: "Could not read downloads folder" });

        res.json(files.map(file => ({
            name: file,
            url: `/downloads/${encodeURIComponent(file)}`
        })));
    });
});

app.use("/downloads", express.static(DOWNLOAD_DIR, {
    setHeaders: res => res.setHeader("Content-Disposition", "attachment")
}));

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Media Downloader running at http://localhost:${PORT}`);
});