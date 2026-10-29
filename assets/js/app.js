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
const songSelect = document.querySelector("#song-select");
const songTitle = document.querySelector("#song-title");
const songArtist = document.querySelector("#song-artist");
const songGenre = document.querySelector("#song-genre");
const songNumber = document.querySelector("#song-number");
const visualizerCanvas = document.querySelector("#visualizer");
const visualizerMode = document.querySelector("#visualizer-mode");
const visualizerContext = visualizerCanvas.getContext("2d");

const lyricLeadIn = 0.65;
const songs = {
  "chasing-cars": {
    title: "Chasing Cars",
    artist: "Snow Patrol",
    genre: "Alternative",
    vocals: "assets/audio/snow-patrol-chasing-cars.mp3",
    instrumental: "assets/audio/snow-patrol-chasing-cars-instrumental.mp3",
    lyrics: "assets/vtt/snow-patrol-chasing-cars.vtt",
  },
  "with-or-without-you": {
    title: "With or Without You",
    artist: "U2",
    genre: "Rock",
    vocals: "assets/audio/u2-with-or-without-you-vocals-playback.mp3",
    instrumental: "assets/audio/u2-with-or-without-you-instrumental-playback.mp3",
    lyrics: "assets/vtt/u2-with-or-without-you.vtt",
  },
  "no-matter-what": {
    title: "No Matter What",
    artist: "Boyzone",
    genre: "Pop",
    vocals: "assets/audio/boyzone-no-matter-what-playback.mp3",
    instrumental: "assets/audio/boyzone-no-matter-instrumental.mp3",
    lyrics: "assets/vtt/boyzone-no-matter-what.vtt",
  },
};
const songIds = Object.keys(songs);
const visualizerModes = [...visualizerMode.options]
  .map((option) => option.value)
  .filter((mode) => mode !== "random-cycle");
const visualizerCycleInterval = 8000;
let cues = [];
let activeCueIndex = -1;
let hasStarted = false;
let stageLetters = [];
let highlightedLetterCount = 0;
let lyricAnimationFrame = null;
let audioContext;
let gainNode;
let analyser;
let frequencyData;
let waveformData;
let visualizerColor = "#d985b7";
let heartPulse = 0;
let lastHeartBeatTime = -Infinity;
let activeVisualizerMode = visualizerMode.value;
let randomVisualizerModes = [];
let randomVisualizerIndex = 0;
let randomVisualizerTimer = null;
let muted = false;
let volumeBeforeMute = Number(volumeSlider.value);
let currentSongId = songSelect.value;
let currentTrack = "vocals";
let pendingTrackChange = null;
let songRequestId = 0;
let audioReady = false;
let lyricsReady = false;

function getTrackSource(track, songId = currentSongId) {
  return songs[songId][track];
}

function isCurrentAudioSource() {
  return audio.currentSrc === new URL(getTrackSource(currentTrack), document.baseURI).href;
}

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
  cues.forEach((cue) => {
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

function drawWaveform(ctx, data, centerX, centerY, width, amplitude, opacity = 1) {
  const step = Math.max(1, Math.floor(data.length / width));
  ctx.globalAlpha = opacity;
  ctx.beginPath();
  for (let x = 0; x < width; x += 1) {
    const sample = data[Math.min(x * step, data.length - 1)] / 128 - 1;
    const y = centerY + sample * amplitude;
    if (x === 0) {
      ctx.moveTo(centerX - width / 2 + x, y);
    } else {
      ctx.lineTo(centerX - width / 2 + x, y);
    }
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawHeart(ctx, centerX, centerY, size) {
  ctx.beginPath();
  ctx.moveTo(centerX, centerY + size * 0.34);
  ctx.bezierCurveTo(
    centerX - size * 0.08, centerY + size * 0.26,
    centerX - size * 0.5, centerY - size * 0.03,
    centerX - size * 0.42, centerY - size * 0.29,
  );
  ctx.bezierCurveTo(
    centerX - size * 0.35, centerY - size * 0.51,
    centerX - size * 0.08, centerY - size * 0.47,
    centerX, centerY - size * 0.27,
  );
  ctx.bezierCurveTo(
    centerX + size * 0.08, centerY - size * 0.47,
    centerX + size * 0.35, centerY - size * 0.51,
    centerX + size * 0.42, centerY - size * 0.29,
  );
  ctx.bezierCurveTo(
    centerX + size * 0.5, centerY - size * 0.03,
    centerX + size * 0.08, centerY + size * 0.26,
    centerX, centerY + size * 0.34,
  );
  ctx.closePath();
}

function renderVisualizer() {
  const { width, height } = visualizerCanvas.getBoundingClientRect();
  if (!width || !height || !visualizerContext) {
    return;
  }

  const ctx = visualizerContext;
  const centerX = width / 2;
  const centerY = height / 2;
  const frequency = frequencyData;
  const waveform = waveformData;
  if (analyser) {
    analyser.getByteFrequencyData(frequency);
    analyser.getByteTimeDomainData(waveform);
  } else {
    frequency?.fill(0);
    waveform?.fill(128);
  }

  const now = performance.now() / 1000;
  let bassEnergy = 0;
  if (activeVisualizerMode === "beating-heart" && frequency) {
    const heartBandEnd = Math.max(1, Math.floor(frequency.length * 0.12));
    for (let index = 1; index < heartBandEnd; index += 1) {
      bassEnergy += frequency[index];
    }
    bassEnergy = heartBandEnd > 1 ? bassEnergy / ((heartBandEnd - 1) * 255) : 0;
    if (
      audioContext?.state === "running" &&
      bassEnergy > 0.16 &&
      now - lastHeartBeatTime > 0.28
    ) {
      heartPulse = Math.min(1, bassEnergy * 1.8);
      lastHeartBeatTime = now;
    }
  }
  heartPulse *= Math.exp(-1 / (0.32 * 60));

  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = visualizerColor;
  ctx.fillStyle = visualizerColor;
  ctx.lineWidth = Math.max(1.5, width / 420);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = visualizerColor;
  ctx.shadowBlur = 12;

  if (activeVisualizerMode === "linear-spectrum" && frequency) {
    const barCount = Math.min(72, Math.floor(width / 7));
    const gap = 3;
    const barWidth = Math.max(2, (width * 0.84 - gap * (barCount - 1)) / barCount);
    const startX = centerX - (barCount * (barWidth + gap) - gap) / 2;
    const middle = Math.floor(frequency.length * 0.56);
    const stride = Math.max(1, Math.floor(middle / barCount));
    ctx.globalAlpha = 0.62;
    for (let index = 0; index < barCount; index += 1) {
      const value = frequency[index * stride] / 255;
      const barHeight = Math.max(2, value * height * 0.38);
      ctx.fillRect(startX + index * (barWidth + gap), centerY - barHeight / 2, barWidth, barHeight);
    }
    ctx.globalAlpha = 1;
  } else if (activeVisualizerMode === "waveform-lines" && waveform) {
    drawWaveform(ctx, waveform, centerX, centerY, width * 0.82, height * 0.18, 0.62);
    drawWaveform(ctx, waveform, centerX, centerY - height * 0.11, width * 0.68, height * 0.1, 0.22);
    drawWaveform(ctx, waveform, centerX, centerY + height * 0.11, width * 0.68, height * 0.1, 0.22);
  } else if (activeVisualizerMode === "waveform" && waveform) {
    drawWaveform(ctx, waveform, centerX, centerY, width * 0.84, height * 0.28, 0.8);
  } else if (activeVisualizerMode === "radial-spectrum" && frequency) {
    const barCount = Math.min(96, frequency.length);
    const innerRadius = Math.min(width, height) * 0.11;
    const maxLength = Math.min(width, height) * 0.31;
    ctx.globalAlpha = 0.64;
    for (let index = 0; index < barCount; index += 1) {
      const angle = (index / barCount) * Math.PI * 2;
      const value = frequency[index] / 255;
      const radius = innerRadius + value * maxLength;
      ctx.beginPath();
      ctx.moveTo(centerX + Math.cos(angle) * innerRadius, centerY + Math.sin(angle) * innerRadius);
      ctx.lineTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else if (activeVisualizerMode === "circular-spectrum" && frequency) {
    const barCount = Math.min(96, frequency.length);
    const radius = Math.min(width, height) * 0.2;
    const maxLength = Math.min(width, height) * 0.21;
    ctx.globalAlpha = 0.64;
    for (let index = 0; index < barCount; index += 1) {
      const angle = (index / barCount) * Math.PI * 2;
      const value = frequency[index] / 255;
      const innerRadius = radius;
      const outerRadius = radius + Math.max(2, value * maxLength);
      ctx.beginPath();
      ctx.moveTo(centerX + Math.cos(angle) * innerRadius, centerY + Math.sin(angle) * innerRadius);
      ctx.lineTo(centerX + Math.cos(angle) * outerRadius, centerY + Math.sin(angle) * outerRadius);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else if (activeVisualizerMode === "polygon-spectrum" && frequency) {
    const pointCount = 64;
    const radius = Math.min(width, height) * 0.27;
    const stride = Math.max(1, Math.floor(frequency.length / pointCount));
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    for (let index = 0; index < pointCount; index += 1) {
      const angle = (index / pointCount) * Math.PI * 2 - Math.PI / 2;
      const value = frequency[index * stride] / 255;
      const pointRadius = radius * (0.32 + value * 0.68);
      const x = centerX + Math.cos(angle) * pointRadius;
      const y = centerY + Math.sin(angle) * pointRadius;
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.78;
    ctx.stroke();
    ctx.globalAlpha = 1;
  } else if (activeVisualizerMode === "mirrored-spectrum" && frequency) {
    const barCount = Math.min(64, Math.floor(width / 8));
    const gap = 3;
    const barWidth = Math.max(2, (width * 0.82 - gap * (barCount - 1)) / barCount);
    const startX = centerX - (barCount * (barWidth + gap) - gap) / 2;
    const stride = Math.max(1, Math.floor((frequency.length * 0.55) / barCount));
    ctx.globalAlpha = 0.64;
    for (let index = 0; index < barCount; index += 1) {
      const barHeight = Math.max(2, (frequency[index * stride] / 255) * height * 0.34);
      const x = startX + index * (barWidth + gap);
      ctx.fillRect(x, centerY - barHeight, barWidth, barHeight);
      ctx.fillRect(x, centerY, barWidth, barHeight);
    }
    ctx.globalAlpha = 1;
  } else if (activeVisualizerMode === "filled-waveform" && waveform) {
    const sampleStep = Math.max(1, Math.floor(waveform.length / width));
    const left = centerX - width * 0.42;
    const right = centerX + width * 0.42;
    const pointCount = Math.max(2, Math.floor(right - left));
    const gradient = ctx.createLinearGradient(0, centerY - height * 0.28, 0, centerY + height * 0.28);
    gradient.addColorStop(0, `${visualizerColor}00`);
    gradient.addColorStop(0.5, `${visualizerColor}bb`);
    gradient.addColorStop(1, `${visualizerColor}00`);
    ctx.beginPath();
    ctx.moveTo(left, centerY);
    for (let index = 0; index < pointCount; index += 1) {
      const sample = waveform[Math.min(index * sampleStep, waveform.length - 1)] / 128 - 1;
      ctx.lineTo(left + index, centerY + sample * height * 0.26);
    }
    ctx.lineTo(right, centerY);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.globalAlpha = 0.76;
    ctx.fill();
    ctx.globalAlpha = 1;
  } else if (activeVisualizerMode === "circular-waveform" && waveform) {
    const pointCount = Math.min(waveform.length, 1024);
    const baseRadius = Math.min(width, height) * 0.23;
    const amplitude = Math.min(width, height) * 0.1;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    for (let index = 0; index < pointCount; index += 1) {
      const angle = (index / pointCount) * Math.PI * 2 - Math.PI / 2;
      const sample = waveform[Math.floor((index / pointCount) * waveform.length)] / 128 - 1;
      const radius = baseRadius + sample * amplitude;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
    ctx.stroke();
    ctx.globalAlpha = 1;
  } else if (activeVisualizerMode === "spectrum-dots" && frequency) {
    const columns = Math.min(56, Math.floor(width / 9));
    const rows = 9;
    const gapX = Math.min(11, width / (columns + 2));
    const gapY = Math.min(11, height / (rows + 2));
    const totalWidth = (columns - 1) * gapX;
    const totalHeight = (rows - 1) * gapY;
    const startX = centerX - totalWidth / 2;
    const startY = centerY - totalHeight / 2;
    const stride = Math.max(1, Math.floor((frequency.length * 0.56) / columns));
    const radius = Math.max(1.2, Math.min(gapX, gapY) * 0.22);
    for (let column = 0; column < columns; column += 1) {
      const strength = frequency[column * stride] / 255;
      const litRows = Math.round(strength * rows);
      for (let row = 0; row < rows; row += 1) {
        const distanceFromCenter = Math.abs(row - (rows - 1) / 2);
        if (distanceFromCenter > litRows / 2) {
          continue;
        }
        const fade = 1 - distanceFromCenter / (rows / 2);
        ctx.globalAlpha = 0.18 + fade * 0.68;
        ctx.beginPath();
        ctx.arc(startX + column * gapX, startY + row * gapY, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  } else if (activeVisualizerMode === "echo-rings" && frequency) {
    const ringCount = 8;
    const maxRadius = Math.min(width, height) * 0.43;
    for (let index = 0; index < ringCount; index += 1) {
      const bin = Math.floor((index / ringCount) * frequency.length * 0.45);
      const strength = frequency[bin] / 255;
      const radius = maxRadius * ((index + 1) / ringCount);
      ctx.globalAlpha = 0.12 + strength * 0.58;
      ctx.lineWidth = Math.max(1, (width / 420) * (0.7 + strength * 1.5));
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius + strength * 9, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else if (activeVisualizerMode === "beating-heart") {
    const pulseScale = 1 + heartPulse * 0.18;
    const heartSize = Math.min(width, height) * 0.72 * pulseScale;
    const glowRadius = heartSize * 0.7;
    const glow = ctx.createRadialGradient(centerX, centerY, heartSize * 0.12, centerX, centerY, glowRadius);
    glow.addColorStop(0, `${visualizerColor}75`);
    glow.addColorStop(1, `${visualizerColor}00`);
    ctx.fillStyle = glow;
    ctx.globalAlpha = 0.28 + heartPulse * 0.25;
    ctx.beginPath();
    ctx.arc(centerX, centerY, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.scale(pulseScale, pulseScale);
    ctx.translate(-centerX, -centerY);
    ctx.fillStyle = visualizerColor;
    ctx.globalAlpha = 0.44 + heartPulse * 0.38;
    ctx.shadowBlur = 12 + heartPulse * 24;
    drawHeart(ctx, centerX, centerY, heartSize);
    ctx.fill();
    ctx.globalAlpha = 0.92;
    ctx.lineWidth = Math.max(1.5, width / 420);
    ctx.stroke();
    ctx.restore();
  }

  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

function shuffleVisualizerModes(previousMode) {
  randomVisualizerModes = [...visualizerModes];
  for (let index = randomVisualizerModes.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [randomVisualizerModes[index], randomVisualizerModes[swapIndex]] = [
      randomVisualizerModes[swapIndex],
      randomVisualizerModes[index],
    ];
  }
  if (randomVisualizerModes[0] === previousMode && randomVisualizerModes.length > 1) {
    [randomVisualizerModes[0], randomVisualizerModes[1]] = [
      randomVisualizerModes[1],
      randomVisualizerModes[0],
    ];
  }
  randomVisualizerIndex = 0;
}

function showNextRandomVisualizer() {
  if (randomVisualizerIndex >= randomVisualizerModes.length) {
    shuffleVisualizerModes(activeVisualizerMode);
  }
  activeVisualizerMode = randomVisualizerModes[randomVisualizerIndex];
  randomVisualizerIndex += 1;
  renderVisualizer();
  randomVisualizerTimer = window.setTimeout(
    showNextRandomVisualizer,
    visualizerCycleInterval,
  );
}

function stopRandomVisualizerCycle() {
  if (randomVisualizerTimer !== null) {
    window.clearTimeout(randomVisualizerTimer);
    randomVisualizerTimer = null;
  }
}

function selectVisualizerMode() {
  stopRandomVisualizerCycle();
  if (visualizerMode.value === "random-cycle") {
    shuffleVisualizerModes(activeVisualizerMode);
    showNextRandomVisualizer();
    return;
  }

  activeVisualizerMode = visualizerMode.value;
  renderVisualizer();
}

function resizeVisualizer() {
  const bounds = visualizerCanvas.getBoundingClientRect();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  visualizerCanvas.width = Math.round(bounds.width * pixelRatio);
  visualizerCanvas.height = Math.round(bounds.height * pixelRatio);
  visualizerContext?.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  renderVisualizer();
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
  renderVisualizer();
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
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.82;
    frequencyData = new Uint8Array(analyser.frequencyBinCount);
    waveformData = new Uint8Array(analyser.fftSize);
    const source = audioContext.createMediaElementSource(audio);
    source.connect(gainNode);
    gainNode.connect(analyser);
    analyser.connect(audioContext.destination);
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

function updateTrackButtons() {
  const vocalsSelected = currentTrack === "vocals";
  vocalTrackButton.classList.toggle("is-selected", vocalsSelected);
  vocalTrackButton.setAttribute("aria-pressed", String(vocalsSelected));
  instrumentalTrackButton.classList.toggle("is-selected", !vocalsSelected);
  instrumentalTrackButton.setAttribute("aria-pressed", String(!vocalsSelected));
}

function updateSongDetails() {
  const song = songs[currentSongId];
  songTitle.textContent = song.title;
  songArtist.textContent = song.artist;
  songGenre.textContent = song.genre;
  songNumber.textContent = `${String(songIds.indexOf(currentSongId) + 1).padStart(2, "0")} / ${String(songIds.length).padStart(2, "0")}`;
  document.title = `KaraokeJS — ${song.title}`;
}

function updateLoadState() {
  const isReady = audioReady && lyricsReady;
  playButton.disabled = !isReady;
  seekSlider.disabled = !isReady;
  if (!isReady) {
    return;
  }

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

  showMessage("Ready when you are — press play to start.");
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
  audioReady = false;
  updateTrackButtons();
  updateLoadState();
  showMessage(`Loading ${track === "vocals" ? "vocal" : "instrumental"} track…`);
  audio.src = getTrackSource(track);
  audio.load();
}

async function loadLyrics(songId, requestId) {
  const song = songs[songId];
  try {
    const response = await fetch(song.lyrics);
    if (!response.ok) {
      throw new Error(`Couldn't load lyrics (${response.status}).`);
    }
    const vtt = await response.text();
    const parsedCues = parseVtt(vtt);
    if (parsedCues.length === 0) {
      throw new Error("The captions file contains no usable lyric cues.");
    }
    if (requestId !== songRequestId) {
      return;
    }

    cues = parsedCues;
    lyricsReady = true;
    renderLyrics();
    updateActiveCue(audio.currentTime);
    updateLoadState();
  } catch (error) {
    if (requestId !== songRequestId) {
      return;
    }
    lyricsReady = false;
    cues = [];
    lyricsList.replaceChildren();
    const placeholder = document.createElement("li");
    placeholder.className = "lyrics-placeholder";
    placeholder.textContent = error.message || "Couldn't load the lyrics.";
    lyricsList.append(placeholder);
    updateLoadState();
    showMessage(error.message || "Couldn't load the lyrics.", true);
  }
}

function selectSong(songId) {
  if (!songs[songId] || songId === currentSongId) {
    return;
  }

  const requestId = ++songRequestId;
  currentSongId = songId;
  currentTrack = "vocals";
  pendingTrackChange = null;
  audio.pause();
  audioReady = false;
  lyricsReady = false;
  cues = [];
  activeCueIndex = -1;
  hasStarted = false;
  renderStageCue("");
  nextLyric.textContent = "";
  lyricsList.replaceChildren();
  const placeholder = document.createElement("li");
  placeholder.className = "lyrics-placeholder";
  placeholder.textContent = "Loading synchronized lyrics…";
  lyricsList.append(placeholder);
  currentTimeLabel.textContent = "0:00";
  durationLabel.textContent = "0:00";
  seekSlider.value = "0";
  seekSlider.style.setProperty("--progress", "0%");
  updateSongDetails();
  updateTrackButtons();
  updateLoadState();
  showMessage("Loading song and lyrics…");

  audio.src = getTrackSource("vocals");
  audio.load();
  loadLyrics(songId, requestId);
}

function handleLoadedMetadata() {
  if (!isCurrentAudioSource()) {
    return;
  }
  audioReady = true;
  durationLabel.textContent = formatTime(audio.duration);
  volumeSlider.disabled = false;
  muteButton.disabled = false;
  updateTimeline();
  updateLoadState();
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
songSelect.addEventListener("change", () => selectSong(songSelect.value));

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
  renderVisualizer();
});
audio.addEventListener("ended", () => {
  updatePlayButton();
  stopLyricAnimation();
  renderVisualizer();
  showMessage("Song finished — want to sing it again?");
});

audio.addEventListener("error", () => {
  if (!isCurrentAudioSource()) {
    return;
  }
  audioReady = false;
  pendingTrackChange = null;
  updateLoadState();
  showMessage(
    `Audio couldn't be loaded. Check ${getTrackSource(currentTrack)}.`,
    true,
  );
});

visualizerMode.addEventListener("change", selectVisualizerMode);
window.addEventListener("resize", resizeVisualizer);
if ("ResizeObserver" in window) {
  new ResizeObserver(resizeVisualizer).observe(visualizerCanvas);
}

document.addEventListener("keydown", (event) => {
  if (
    event.code !== "Space" ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.target instanceof HTMLButtonElement ||
    event.target instanceof HTMLSelectElement ||
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

audio.src = getTrackSource(currentTrack);
audio.load();
loadLyrics(currentSongId, songRequestId);

updateVolume();
visualizerColor = "#d985b7";
resizeVisualizer();

if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
  handleLoadedMetadata();
}
