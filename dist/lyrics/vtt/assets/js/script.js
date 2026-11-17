const audio = document.querySelector("audio");
const statusBox = document.querySelector(".status-box");

let cues = [];
let activeCueIndex = -1;
let lyricRows = [];
let lyricAnimationFrame = null;

function parseTimestamp(timestamp) {
  const parts = timestamp.trim().replace(",", ".").split(":");
  if (parts.length < 2 || parts.length > 3) {
    throw new Error(`Invalid WebVTT timestamp: ${timestamp}`);
  }

  const seconds = Number(parts.pop());
  const minutes = Number(parts.pop());
  const hours = parts.length ? Number(parts.pop()) : 0;
  if (
    ![hours, minutes, seconds].every(Number.isFinite) ||
    seconds >= 60 ||
    minutes >= 60 ||
    hours < 0 ||
    minutes < 0 ||
    seconds < 0
  ) {
    throw new Error(`Invalid WebVTT timestamp: ${timestamp}`);
  }
  return hours * 3600 + minutes * 60 + seconds;
}

function parseVtt(source) {
  const normalized = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (!normalized.trimStart().startsWith("WEBVTT")) {
    throw new Error("The captions file is not valid WebVTT.");
  }

  const parsedCues = [];
  for (const block of normalized.split(/\n{2,}/).slice(1)) {
    const lines = block.split("\n");
    if (!lines.length || /^(NOTE|STYLE|REGION)(?:\s|$)/.test(lines[0].trim())) {
      continue;
    }

    const timingLineIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingLineIndex < 0) {
      continue;
    }

    const timing = lines[timingLineIndex].match(
      /^\s*(\S+)\s+-->\s+(\S+)(?:\s+.*)?$/,
    );
    if (!timing) {
      throw new Error("The captions file contains an invalid cue.");
    }

    const start = parseTimestamp(timing[1]);
    const end = parseTimestamp(timing[2]);
    const text = lines
      .slice(timingLineIndex + 1)
      .join("\n")
      .replace(/<[^>]*>/g, "")
      .trim();
    if (end <= start || !text) {
      continue;
    }

    parsedCues.push({ start, end, text });
  }

  return parsedCues.sort((a, b) => a.start - b.start);
}

function renderCue(cue) {
  lyricRows = [];
  if (!cue) {
    statusBox.replaceChildren();
    return;
  }

  const lines = cue.text.split("\n");
  const lyricBlock = document.createElement("div");
  lyricBlock.className = "lyric-line";

  for (const text of lines) {
    const row = document.createElement("span");
    row.className = "lyric-row";
    row.style.setProperty("--lyric-progress", "0%");

    const base = document.createElement("span");
    base.className = "lyric-base";
    base.textContent = text;

    const fill = document.createElement("span");
    fill.className = "lyric-fill";
    fill.textContent = text;
    fill.setAttribute("aria-hidden", "true");

    row.append(base, fill);
    lyricRows.push(row);
    lyricBlock.append(row);
  }

  statusBox.replaceChildren(lyricBlock);
}

function updateActiveCue(time) {
  let low = 0;
  let high = cues.length - 1;
  let candidate = -1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (cues[middle].start <= time) {
      candidate = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  const current = candidate >= 0 && time < cues[candidate].end ? candidate : -1;
  if (current !== activeCueIndex) {
    activeCueIndex = current;
    renderCue(cues[current]);
  }

  if (current >= 0 && lyricRows.length > 0) {
    const cue = cues[current];
    const cueProgress = Math.min(
      1,
      Math.max(0, (time - cue.start) / (cue.end - cue.start)),
    );
    const lineProgress = cueProgress * lyricRows.length;
    const activeLineIndex = Math.min(
      Math.floor(lineProgress),
      lyricRows.length - 1,
    );
    const activeLineProgress = lineProgress - activeLineIndex;

    lyricRows.forEach((row, index) => {
      const progress =
        index < activeLineIndex
          ? 1
          : index === activeLineIndex
            ? activeLineProgress
            : 0;
      row.style.setProperty(
        "--lyric-progress",
        `${(progress * 100).toFixed(2)}%`,
      );
    });
  }
}

function animateLyrics() {
  updateActiveCue(audio.currentTime);
  if (!audio.paused && !audio.ended) {
    lyricAnimationFrame = requestAnimationFrame(animateLyrics);
  } else {
    lyricAnimationFrame = null;
  }
}

function stopLyricAnimation() {
  if (lyricAnimationFrame !== null) {
    cancelAnimationFrame(lyricAnimationFrame);
    lyricAnimationFrame = null;
  }
  updateActiveCue(audio.currentTime);
}

async function loadLyrics() {
  try {
    const response = await fetch("assets/vtt/u2-vertigo.vtt");
    if (!response.ok) {
      throw new Error(`Couldn't load lyrics (${response.status}).`);
    }

    cues = parseVtt(await response.text());
    if (cues.length === 0) {
      throw new Error("The lyrics file contains no usable lyric cues.");
    }
    statusBox.dataset.error = "false";
    updateActiveCue(audio.currentTime);
  } catch (error) {
    statusBox.textContent = error.message || "Couldn't load the lyrics.";
    statusBox.dataset.error = "true";
    console.error("Couldn't load karaoke lyrics.", error);
  }
}

if (!audio || !statusBox) {
  throw new Error(
    "The karaoke page is missing its audio player or status box.",
  );
}

audio.addEventListener(
  "loadedmetadata",
  () => {
    audio.currentTime = Math.min(22.5, audio.duration);
    updateActiveCue(audio.currentTime);
  },
  { once: true },
);
audio.addEventListener("timeupdate", () => updateActiveCue(audio.currentTime));
audio.addEventListener("seeking", () => updateActiveCue(audio.currentTime));
audio.addEventListener("play", () => {
  updateActiveCue(audio.currentTime);
  if (lyricAnimationFrame === null) {
    lyricAnimationFrame = requestAnimationFrame(animateLyrics);
  }
});
audio.addEventListener("pause", stopLyricAnimation);
audio.addEventListener("ended", stopLyricAnimation);

loadLyrics();
