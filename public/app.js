const urlInput = document.getElementById("url");
const buttons = document.querySelectorAll(".download-btn");
const status = document.getElementById("status");
const statusText = document.querySelector(".status-text");
const progress = document.getElementById("progress");
const percentage = document.getElementById("percentage");
const message = document.getElementById("message");
const filesContainer = document.getElementById("files");
const refreshButton = document.getElementById("refresh");

function showMessage(text, type = "") {
    message.textContent = text;
    message.className = "message";
    if (type) message.classList.add(type);
}

function setButtonsDisabled(disabled) {
    buttons.forEach(button => button.disabled = disabled);
}

async function startDownload(type) {
    const url = urlInput.value.trim();

    if (!url) {
        showMessage("Please paste a YouTube or Instagram URL.", "error");
        return;
    }

    status.classList.remove("hidden");
    statusText.textContent = "Starting download...";
    progress.style.width = "0%";
    percentage.textContent = "0%";
    showMessage("");
    setButtonsDisabled(true);

    const streamURL = `/api/download?url=${encodeURIComponent(url)}&type=${type}`;

    try {
        const response = await fetch(streamURL);

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "Request failed");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split("\n\n");
            buffer = events.pop() || "";

            for (const event of events) {
                if (!event.startsWith("data:")) continue;

                const json = event.substring(5).trim();
                if (!json) continue;

                const data = JSON.parse(json);

                if (data.type === "progress") {
                    const percent = Math.round(data.progress);
                    progress.style.width = `${percent}%`;
                    percentage.textContent = `${percent}%`;
                    statusText.textContent = "Downloading...";
                }

                if (data.type === "complete") {
                    progress.style.width = "100%";
                    percentage.textContent = "100%";
                    statusText.textContent = "Download complete.";
                    showMessage("File ready! Starting download...", "success");

                    // Direct file download redirect
                    if (data.downloadUrl) {
                        window.location.href = data.downloadUrl;
                    }

                    loadFiles();
                }

                if (data.type === "error") {
                    showMessage(data.message, "error");
                    statusText.textContent = "Download failed.";
                }
            }
        }
    } catch (error) {
        console.error(error);
        showMessage(error.message || "Something went wrong.", "error");
        statusText.textContent = "Download failed.";
    } finally {
        setButtonsDisabled(false);
    }
}

buttons.forEach(button => {
    button.addEventListener("click", () => startDownload(button.dataset.type));
});

async function loadFiles() {
    try {
        const response = await fetch("/api/files");
        const files = await response.json();

        if (!files.length) {
            filesContainer.innerHTML = "<p>No downloaded files yet.</p>";
            return;
        }

        filesContainer.innerHTML = files.map(file => `
            <div class="file">
                <div class="file-name">${escapeHTML(file.name)}</div>
                <a href="${file.url}" download>Download</a>
            </div>
        `).join("");
    } catch {
        filesContainer.innerHTML = "<p>Could not load files.</p>";
    }
}

function escapeHTML(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

if (refreshButton) {
    refreshButton.addEventListener("click", loadFiles);
}

loadFiles();
