const audio = document.querySelector("#audio");
const playButton = document.querySelector("#play");
const seekSlider = document.querySelector("#seek");
const volumeSlider = document.querySelector("#volume");
const muteButton = document.querySelector("#mute");
const currentTimeLabel = document.querySelector("#current-time");
const durationLabel = document.querySelector("#duration");
const currentLyric = document.querySelector("#current-lyric");
const nextLyric = document.querySelector("#next-lyric");
const lyricsList = document.querySelector("#lyrics-list");
const playerMessage = document.querySelector("#player-message");
const vocalTrackButton = document.querySelector("#track-vocals");
const instrumentalTrackButton = document.querySelector("#track-instrumental");

const lyricLeadIn = 0.65;
const trackSources = {
  vocals: "assets/audio/snow-patrol-chasing-cars.mp3",
  instrumental: "assets/audio/snow-patrol-chasing-cars-instrumental.mp3",
};
let cues = [];
let activeCueIndex = -1;
let hasStarted = false;
let stageLetters = [];
let highlightedLetterCount = 0;
let lyricAnimationFrame = null;
let audioContext;
let gainNode;
let muted = false;
let volumeBeforeMute = Number(volumeSlider.value);
let currentTrack = "vocals";
let pendingTrackChange = null;

function showMessage(message, isError = false) {
  playerMessage.textContent = message;
  playerMessage.dataset.error = String(isError);
}

function parseTimestamp(timestamp) {
  const parts = timestamp.trim().replace(",", ".").split(":");
  if (parts.length < 2 || parts.length > 3) {
    throw new Error(`Invalid WebVTT timestamp: ${timestamp}`);
  }

  const seconds = Number(parts.pop());
  const minutes = Number(parts.pop());
  const hours = parts.length ? Number(parts.pop()) : 0;
  if (![hours, minutes, seconds].every(Number.isFinite) || seconds >= 60 || minutes >= 60) {
    throw new Error(`Invalid WebVTT timestamp: ${timestamp}`);
  }
  return hours * 3600 + minutes * 60 + seconds;
}

function parseVtt(source) {
  const normalized = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (!normalized.trimStart().startsWith("WEBVTT")) {
    throw new Error("The captions file is not valid WebVTT.");
  }

  const blocks = normalized.split(/\n{2,}/);
  const parsedCues = [];

  for (const block of blocks.slice(1)) {
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
      throw new Error(`Invalid WebVTT cue timing: ${lines[timingLineIndex]}`);
    }

    const start = parseTimestamp(timing[1]);
    const end = parseTimestamp(timing[2]);
    const text = lines.slice(timingLineIndex + 1).join("\n").trim();
    if (end <= start || !text) {
      continue;
    }
    parsedCues.push({ start, end, text });
  }

  return parsedCues.sort((a, b) => a.start - b.start);
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function renderLyrics() {
  const fragment = document.createDocumentFragment();
  cues.forEach((cue, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = cue.text;
    button.setAttribute("aria-label", `Jump to ${formatTime(cue.start)}: ${cue.text.replace(/\s+/g, " ")}`);
    button.addEventListener("click", () => {
      if (!Number.isFinite(audio.duration)) {
        showMessage("Audio is not available, so you can't seek yet.", true);
        return;
      }
      audio.currentTime = cue.start;
      if (audio.paused) {
        playAudio();
      }
    });
    item.append(button);
    fragment.append(item);
  });
  lyricsList.replaceChildren(fragment);
}

function renderStageCue(text) {
  const fragment = document.createDocumentFragment();
  stageLetters = [];
  highlightedLetterCount = 0;

  for (const character of text) {
    if (character === "\n") {
      fragment.append(document.createElement("br"));
    } else if (/\s/.test(character)) {
      fragment.append(document.createTextNode(character));
    } else {
      const letter = document.createElement("span");
      letter.className = "lyric-letter";
      letter.textContent = character;
      stageLetters.push(letter);
      fragment.append(letter);
    }
  }

  currentLyric.replaceChildren(fragment);
}

function updateLyricHighlight(time) {
  const cue = cues[activeCueIndex];
  if (!cue || stageLetters.length === 0) {
    return;
  }

  const progress = Math.max(0, Math.min(1, (time - cue.start) / (cue.end - cue.start)));
  const nextHighlightedCount = Math.ceil(progress * stageLetters.length);

  for (let index = highlightedLetterCount; index < nextHighlightedCount; index += 1) {
    stageLetters[index].classList.add("is-sung");
  }
  for (let index = nextHighlightedCount; index < highlightedLetterCount; index += 1) {
    stageLetters[index].classList.remove("is-sung");
  }
  highlightedLetterCount = nextHighlightedCount;
}

function updateActiveCue(time) {
  if (!hasStarted) {
    return;
  }

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
  if (current === activeCueIndex) {
    updateLyricHighlight(time);
    return;
  }

  activeCueIndex = current;
  const lyricItems = lyricsList.children;
  for (let index = 0; index < lyricItems.length; index += 1) {
    const isActive = index === current;
    lyricItems[index].classList.toggle("is-active", isActive);
    lyricItems[index].setAttribute("aria-current", isActive ? "true" : "false");
  }

  if (current < 0) {
    renderStageCue("");
    nextLyric.textContent =
      candidate >= 0 && candidate + 1 < cues.length
        ? cues[candidate + 1].text
        : "";
    return;
  }

  renderStageCue(cues[current].text);
  nextLyric.textContent = cues[current + 1]?.text ?? "Let the music take you there";
  updateLyricHighlight(time);
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

async function initializeAudioContext() {
  if (!audioContext) {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) {
      throw new Error("This browser does not support the Web Audio API.");
    }
    audioContext = new AudioContextConstructor();
    gainNode = audioContext.createGain();
    const source = audioContext.createMediaElementSource(audio);
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);
    gainNode.gain.value = muted ? 0 : Number(volumeSlider.value);
  }

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }
}

async function playAudio() {
  try {
    await initializeAudioContext();
    await audio.play();
    showMessage("You're all set — sing along!");
  } catch (error) {
    showMessage(error.message || "Couldn't start audio playback.", true);
  }
}

function updatePlayButton() {
  const isPlaying = !audio.paused;
  playButton.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
  playButton.title = isPlaying ? "Pause" : "Play";
}

function updateTimeline() {
  currentTimeLabel.textContent = formatTime(audio.currentTime);
  if (Number.isFinite(audio.duration) && audio.duration > 0) {
    const progress = (audio.currentTime / audio.duration) * 100;
    seekSlider.value = String(progress);
    seekSlider.style.setProperty("--progress", `${progress}%`);
    seekSlider.setAttribute(
      "aria-valuetext",
      `${formatTime(audio.currentTime)} of ${formatTime(audio.duration)}`,
    );
  }
}

function selectTrack(track) {
  if (track === currentTrack) {
    return;
  }

  const position = pendingTrackChange?.position ?? audio.currentTime;
  const shouldResume = pendingTrackChange?.shouldResume ?? !audio.paused;
  audio.pause();
  currentTrack = track;
  pendingTrackChange = { position, shouldResume };

  const vocalsSelected = track === "vocals";
  vocalTrackButton.classList.toggle("is-selected", vocalsSelected);
  vocalTrackButton.setAttribute("aria-pressed", String(vocalsSelected));
  instrumentalTrackButton.classList.toggle("is-selected", !vocalsSelected);
  instrumentalTrackButton.setAttribute("aria-pressed", String(!vocalsSelected));

  playButton.disabled = true;
  seekSlider.disabled = true;
  showMessage(`Loading ${vocalsSelected ? "vocal" : "instrumental"} track…`);
  audio.src = trackSources[track];
  audio.load();
}

function handleLoadedMetadata() {
  durationLabel.textContent = formatTime(audio.duration);
  seekSlider.disabled = false;
  volumeSlider.disabled = false;
  muteButton.disabled = false;
  playButton.disabled = false;

  if (pendingTrackChange) {
    const { position, shouldResume } = pendingTrackChange;
    pendingTrackChange = null;
    audio.currentTime = Math.min(position, audio.duration);
    updateTimeline();
    updateActiveCue(audio.currentTime);
    if (shouldResume) {
      playAudio();
    } else {
      showMessage(`Ready — ${currentTrack === "vocals" ? "vocals" : "instrumental"} track selected.`);
    }
    return;
  }

  updateTimeline();
  showMessage("Ready when you are — press play to start.");
}

function updateVolume() {
  const volume = Number(volumeSlider.value);
  if (!muted) {
    volumeBeforeMute = volume;
  }
  if (gainNode) {
    gainNode.gain.setTargetAtTime(
      muted ? 0 : volume,
      audioContext.currentTime,
      0.015,
    );
  }
  volumeSlider.style.setProperty("--volume", `${volume * 100}%`);
}

playButton.addEventListener("click", () => {
  if (audio.paused) {
    playAudio();
  } else {
    audio.pause();
  }
});

document.querySelector("#back").addEventListener("click", () => {
  if (Number.isFinite(audio.duration)) {
    audio.currentTime = Math.max(0, audio.currentTime - 10);
  }
});

document.querySelector("#forward").addEventListener("click", () => {
  if (Number.isFinite(audio.duration)) {
    audio.currentTime = Math.min(audio.duration, audio.currentTime + 10);
  }
});

muteButton.addEventListener("click", () => {
  muted = !muted;
  if (!muted && Number(volumeSlider.value) === 0) {
    volumeSlider.value = String(volumeBeforeMute || 0.8);
  }
  muteButton.classList.toggle("is-muted", muted);
  muteButton.setAttribute("aria-label", muted ? "Unmute" : "Mute");
  muteButton.title = muted ? "Unmute" : "Mute";
  updateVolume();
});

volumeSlider.addEventListener("input", () => {
  if (Number(volumeSlider.value) > 0 && muted) {
    muted = false;
    muteButton.classList.remove("is-muted");
    muteButton.setAttribute("aria-label", "Mute");
    muteButton.title = "Mute";
  }
  updateVolume();
});

seekSlider.addEventListener("input", () => {
  if (Number.isFinite(audio.duration)) {
    audio.currentTime = (Number(seekSlider.value) / 100) * audio.duration;
    updateTimeline();
  }
});

vocalTrackButton.addEventListener("click", () => selectTrack("vocals"));
instrumentalTrackButton.addEventListener("click", () => selectTrack("instrumental"));

audio.addEventListener("loadedmetadata", handleLoadedMetadata);

audio.addEventListener("timeupdate", () => {
  updateTimeline();
  updateActiveCue(audio.currentTime);
});

audio.addEventListener("play", () => {
  hasStarted = true;
  updatePlayButton();
  updateActiveCue(audio.currentTime);
  if (lyricAnimationFrame === null) {
    lyricAnimationFrame = requestAnimationFrame(animateLyrics);
  }
});
audio.addEventListener("pause", () => {
  updatePlayButton();
  stopLyricAnimation();
});
audio.addEventListener("ended", () => {
  updatePlayButton();
  stopLyricAnimation();
  showMessage("Song finished — want to sing it again?");
});

audio.addEventListener("error", () => {
  pendingTrackChange = null;
  playButton.disabled = true;
  seekSlider.disabled = true;
  showMessage(
    `Audio couldn't be loaded. Check ${trackSources[currentTrack]}.`,
    true,
  );
});

document.addEventListener("keydown", (event) => {
  if (
    event.code !== "Space" ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.target instanceof HTMLButtonElement ||
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement
  ) {
    return;
  }
  event.preventDefault();
  if (audio.paused) {
    playAudio();
  } else {
    audio.pause();
  }
});

fetch("assets/vtt/snow-patrol-chasing-cars.vtt")
  .then((response) => {
    if (!response.ok) {
      throw new Error(`Couldn't load lyrics (${response.status}).`);
    }
    return response.text();
  })
  .then((vtt) => {
    cues = parseVtt(vtt);
    if (cues.length === 0) {
      throw new Error("The captions file contains no usable lyric cues.");
    }
    renderLyrics();
    updateActiveCue(0);
    if (audio.error) {
      showMessage(
        "Lyrics are ready, but audio couldn't be loaded. Add a valid MP3 at assets/audio/snow-patrol-chasing-cars.mp3.",
        true,
      );
    } else if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
      showMessage("Ready when you are — press play to start.");
    } else {
      showMessage("Lyrics ready — loading the track…");
    }
  })
  .catch((error) => {
    lyricsList.replaceChildren();
    const placeholder = document.createElement("li");
    placeholder.className = "lyrics-placeholder";
    placeholder.textContent = error.message || "Couldn't load the lyrics.";
    lyricsList.append(placeholder);
    showMessage(error.message || "Couldn't load the lyrics.", true);
  });

updateVolume();

if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
  handleLoadedMetadata();
}
