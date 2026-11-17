const audio = document.querySelector("audio");
const statusBox = document.querySelector(".status-box");
const lyricLeadIn = 0;

let cues = [];
let activeCueIndex = -1;
let lyricWords = [];
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
    minutes >= 60
  ) {
    throw new Error(`Invalid WebVTT timestamp: ${timestamp}`);
  }
  return hours * 3600 + minutes * 60 + seconds;
}

function parseWordLyrics(source) {
  const data = JSON.parse(source);
  if (!Array.isArray(data.lines)) {
    throw new Error("The lyrics file does not contain a valid lines array.");
  }

  const parseLyricsTime = (time) =>
    typeof time === "number"
      ? time
      : typeof time === "string"
        ? parseTimestamp(time)
        : Number.NaN;

  const parsedCues = data.lines.map((line) => {
    const start = parseLyricsTime(line.startTime);
    const end = parseLyricsTime(line.endTime);
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end <= start ||
      !Array.isArray(line.words)
    ) {
      throw new Error("The lyrics file contains an invalid lyric line.");
    }

    const words = line.words.map((word) => {
      const wordStart = parseLyricsTime(word.start);
      const wordEnd = parseLyricsTime(word.end);
      if (
        typeof word.text !== "string" ||
        !word.text.trim() ||
        !Number.isFinite(wordStart) ||
        !Number.isFinite(wordEnd) ||
        wordEnd <= wordStart
      ) {
        throw new Error("The lyrics file contains an invalid lyric word.");
      }
      return { text: word.text, start: wordStart, end: wordEnd };
    });

    return { start, end, words };
  });

  return parsedCues.sort((a, b) => a.start - b.start);
}

function renderCue(cue) {
  const fragment = document.createDocumentFragment();
  lyricWords = [];

  cue?.words.forEach((word, index) => {
    if (index > 0) {
      fragment.append(document.createTextNode(" "));
    }
    const wordElement = document.createElement("span");
    wordElement.textContent = word.text;
    wordElement.style.color = "rgba(30, 32, 34, 0.35)";
    wordElement.style.transition = "color 100ms linear";
    lyricWords.push(wordElement);
    fragment.append(wordElement);
  });

  if (cue?.words.length) {
    statusBox.style.textAlign = "center";
    statusBox.style.fontSize = "clamp(24px, 3vw, 40px)";
    statusBox.style.fontWeight = "600";
    statusBox.style.lineHeight = "1.5";
  }

  statusBox.replaceChildren(fragment);
}

function updateLyricHighlight(time, cue) {
  if (!cue) {
    return;
  }

  cue.words.forEach((word, index) => {
    const wordElement = lyricWords[index];
    if (time >= word.start && time < word.end) {
      wordElement.style.color = "#d66bb2";
      wordElement.style.textDecoration = "underline";
      wordElement.style.textUnderlineOffset = "12px";
      wordElement.style.textDecorationThickness = "8px";
      wordElement.style.textDecorationColor = "#A1DCF2";
    } else if (time >= word.end) {
      wordElement.style.color = "var(--text)";
      wordElement.style.textDecoration = "none";
    } else {
      wordElement.style.color = "rgba(30, 32, 34, 0.35)";
      wordElement.style.textDecoration = "none";
    }
  });
}

function updateActiveCue(time) {
  let low = 0;
  let high = cues.length - 1;
  let candidate = -1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (cues[middle].start - lyricLeadIn <= time) {
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
  updateLyricHighlight(time, cues[current]);
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
    const response = await fetch("assets/json/u2-vertigo.json");
    if (!response.ok) {
      throw new Error(`Couldn't load lyrics (${response.status}).`);
    }

    cues = parseWordLyrics(await response.text());
    if (cues.length === 0) {
      throw new Error("The lyrics file contains no usable lyric cues.");
    }
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
