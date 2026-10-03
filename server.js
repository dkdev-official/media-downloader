const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const PUBLIC_DIR = path.join(__dirname, "public");
app.use(express.static(PUBLIC_DIR));

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

// Download API using reliable Cobalt engine
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

  try {
    sendEvent("progress", { percent: 30 });

    const response = await fetch("https://co.wuk.sh/api/json", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        url: url,
        downloadMode: type === "audio" ? "audio" : "auto",
        audioFormat: "mp3"
      })
    });

    const data = await response.json();
    sendEvent("progress", { percent: 80 });

    if (data.url) {
      sendEvent("progress", { percent: 100 });
      sendEvent("complete", { message: "Success!", downloadUrl: data.url });
    } else {
      sendEvent("error", { message: "Could not fetch media. Try another link." });
    }
  } catch (err) {
    console.error(err);
    sendEvent("error", { message: "API Error: " + err.message });
  } finally {
    res.end();
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
