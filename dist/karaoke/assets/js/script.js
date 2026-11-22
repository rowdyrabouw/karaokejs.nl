const audio = document.querySelector("audio");
const canvas = document.querySelector("#visualizer");
const context = canvas.getContext("2d");
const visualizerStage = document.querySelector(".visualizer-stage");
const errorMessage = document.querySelector("#visualizer-error");
const statusBox = document.querySelector(".status-box");
const visualizerButtons = document.querySelectorAll("[data-visualizer]");
const trackButtons = document.querySelectorAll("[data-track]");
const playbackButton = document.querySelector("#playback-toggle");
const seekSlider = document.querySelector("#seek");
const volumeSlider = document.querySelector("#volume");
const currentTimeLabel = document.querySelector("#current-time");
const durationLabel = document.querySelector("#duration");
const playerMessage = document.querySelector("#player-message");
const pageLayout = document.querySelector("main");
const randomVisualizerButton = document.querySelector(
  "[data-random-visualizer]",
);

let audioContext;
let analyser;
let waveform;
let frequency;
let animationFrame = null;
let randomVisualsInterval = null;
let visualizerType = "waveform";
let particles = [];
let previousBassEnergy = 0;
let beatPulse = 0;
let beatCooldown = 0;
let trackChangeId = 0;
const cloverColors = ["#169b62", "#ffffff", "#ff883e"];
const cloverOutlineColors = ["#0d7548", "#a9b5ad", "#cf642c"];
const cloverVeinColors = [
  "rgba(8, 94, 55, 0.45)",
  "rgba(130, 140, 134, 0.4)",
  "rgba(177, 69, 25, 0.4)",
];

function resizeCanvas() {
  const bounds = visualizerStage.getBoundingClientRect();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  if (!bounds.width || !bounds.height) {
    return;
  }

  const pixelWidth = Math.round(bounds.width * pixelRatio);
  const pixelHeight = Math.round(bounds.height * pixelRatio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  if (visualizerType === "particles") {
    initializeParticles(bounds.width, bounds.height);
  }
  drawVisualizer();
}

function drawVisualizer() {
  const { width, height } = visualizerStage.getBoundingClientRect();
  if (!width || !height) {
    return;
  }

  context.clearRect(0, 0, width, height);
  if (analyser && !audio.paused && !audio.ended) {
    if (
      visualizerType === "frequency" ||
      visualizerType === "radial" ||
      visualizerType === "particles" ||
      visualizerType === "terrain"
    ) {
      analyser.getByteFrequencyData(frequency);
      if (visualizerType === "radial") {
        drawRadialSpectrum(width, height);
      } else if (visualizerType === "particles") {
        drawParticles(width, height);
      } else if (visualizerType === "terrain") {
        drawTerrain(width, height);
      } else {
        drawFrequencySpectrum(width, height);
      }
    } else {
      analyser.getByteTimeDomainData(waveform);
      drawWaveform(width, height);
    }
  }
}

function animateVisualizer() {
  animationFrame = null;
  drawVisualizer();
  if (!audio.paused && !audio.ended) {
    animationFrame = requestAnimationFrame(animateVisualizer);
  }
}

function drawWaveform(width, height) {
  const centerY = height / 2;
  const amplitude = height * 0.42;
  const step = width / (waveform.length - 1);
  const gradient = context.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, "#69cae6");
  gradient.addColorStop(0.5, "#d66bb2");
  gradient.addColorStop(1, "#f7c443");

  context.beginPath();
  for (let index = 0; index < waveform.length; index += 1) {
    const x = index * step;
    const y = centerY + ((waveform[index] - 128) / 128) * amplitude;
    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  }

  context.strokeStyle = gradient;
  context.lineWidth = 3;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.shadowColor = "rgba(214, 107, 178, 0.5)";
  context.shadowBlur = 12;
  context.stroke();
  context.shadowBlur = 0;
}

function drawFrequencySpectrum(width, height) {
  const barCount = Math.min(72, Math.max(12, Math.floor(width / 8)));
  const gap = 3;
  const barWidth = (width - gap * (barCount - 1)) / barCount;
  const maxBarHeight = height * 0.82;
  const gradient = context.createLinearGradient(0, height, 0, 0);
  gradient.addColorStop(0, "#69cae6");
  gradient.addColorStop(0.55, "#d66bb2");
  gradient.addColorStop(1, "#f7c443");

  context.fillStyle = gradient;
  context.shadowColor = "rgba(214, 107, 178, 0.42)";
  context.shadowBlur = 10;

  for (let index = 0; index < barCount; index += 1) {
    const progress = (index + 1) / barCount;
    const bin = Math.min(
      frequency.length - 1,
      Math.floor(progress * progress * frequency.length * 0.8),
    );
    const barHeight = Math.max(2, (frequency[bin] / 255) * maxBarHeight);
    const x = index * (barWidth + gap);
    context.fillRect(x, height - barHeight, barWidth, barHeight);
  }

  context.shadowBlur = 0;
}

function drawRadialSpectrum(width, height) {
  const centerX = width / 2;
  const centerY = height / 2;
  const size = Math.min(width, height);
  const barCount = Math.min(96, frequency.length);
  const innerRadius = size * 0.13;
  const maxBarLength = size * 0.3;

  context.lineWidth = Math.max(2, size / 160);
  context.lineCap = "round";
  context.shadowColor = "rgba(214, 107, 178, 0.5)";
  context.shadowBlur = 10;

  for (let index = 0; index < barCount; index += 1) {
    const angle = (index / barCount) * Math.PI * 2 - Math.PI / 2;
    const bin = Math.floor((index / barCount) * frequency.length * 0.72);
    const barLength = Math.max(2, (frequency[bin] / 255) * maxBarLength);
    const outerRadius = innerRadius + barLength;

    context.strokeStyle =
      index / barCount < 0.5
        ? "#69cae6"
        : index / barCount < 0.78
          ? "#d66bb2"
          : "#f7c443";
    context.beginPath();
    context.moveTo(
      centerX + Math.cos(angle) * innerRadius,
      centerY + Math.sin(angle) * innerRadius,
    );
    context.lineTo(
      centerX + Math.cos(angle) * outerRadius,
      centerY + Math.sin(angle) * outerRadius,
    );
    context.stroke();
  }

  context.shadowBlur = 0;
}

function drawTerrain(width, height) {
  const now = performance.now() / 1000;
  const pointCount = Math.min(96, Math.max(32, Math.floor(width / 5)));
  const size = Math.min(width, height);
  const layers = [
    { base: 0.7, height: 0.36, color: "#69cae6", phase: 0.2 },
    { base: 0.79, height: 0.31, color: "#d66bb2", phase: 1.8 },
    { base: 0.88, height: 0.25, color: "#f7c443", phase: 3.4 },
  ];

  layers.forEach((layer, layerIndex) => {
    const points = [];
    for (let index = 0; index <= pointCount; index += 1) {
      const progress = index / pointCount;
      const bin = Math.min(
        frequency.length - 1,
        Math.floor(progress * progress * frequency.length * 0.72),
      );
      const energy = frequency[bin] / 255;
      const broadRidge =
        Math.sin(progress * Math.PI * 3.2 + layer.phase) * 0.09 +
        Math.sin(progress * Math.PI * 6.4 - layer.phase) * 0.035;
      const rolling =
        Math.sin(progress * 8 + now * (0.18 + layerIndex * 0.05)) * 0.025;
      const peak = Math.max(0, broadRidge + 0.1) + energy * 0.52 + rolling;
      const x = progress * width;
      const y =
        height * layer.base -
        peak * layer.height * size -
        energy * layer.height * size * 0.24;
      points.push({ x, y: Math.max(height * 0.08, y) });
    }

    const gradient = context.createLinearGradient(
      0,
      height * (layer.base - layer.height),
      0,
      height,
    );
    gradient.addColorStop(0, `${layer.color}bb`);
    gradient.addColorStop(1, `${layer.color}20`);
    context.beginPath();
    context.moveTo(0, height);
    context.lineTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const point = points[index];
      const middleX = (previous.x + point.x) / 2;
      const middleY = (previous.y + point.y) / 2;
      context.quadraticCurveTo(previous.x, previous.y, middleX, middleY);
    }
    const lastPoint = points[points.length - 1];
    context.lineTo(lastPoint.x, lastPoint.y);
    context.lineTo(width, height);
    context.closePath();
    context.fillStyle = gradient;
    context.fill();

    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const point = points[index];
      context.quadraticCurveTo(
        previous.x,
        previous.y,
        (previous.x + point.x) / 2,
        (previous.y + point.y) / 2,
      );
    }
    context.lineTo(lastPoint.x, lastPoint.y);
    context.strokeStyle = `${layer.color}dd`;
    context.lineWidth = Math.max(1.5, size / 160);
    context.lineJoin = "round";
    context.shadowColor = `${layer.color}66`;
    context.shadowBlur = 8;
    context.stroke();
    context.shadowBlur = 0;
  });
}

function initializeParticles(width, height) {
  const count = Math.min(
    36,
    Math.max(10, Math.floor((width * height) / 40000)),
  );
  particles = Array.from({ length: count }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    velocityX: (Math.random() - 0.5) * 0.8,
    velocityY: (Math.random() - 0.5) * 0.8,
    size: 3.5 + Math.random() * 3,
    frequencyBin: Math.floor(Math.random() * 160),
    rotation: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.035,
  }));
}

function drawClover(radius) {
  for (let leaf = 0; leaf < 3; leaf += 1) {
    context.save();
    context.rotate((leaf / 3) * Math.PI * 2);
    const color = cloverColors[leaf];
    context.beginPath();
    context.moveTo(0, 0);
    context.bezierCurveTo(
      -radius * 0.25,
      -radius * 0.15,
      -radius * 0.86,
      -radius * 0.08,
      -radius * 0.78,
      -radius * 0.58,
    );
    context.bezierCurveTo(
      -radius * 0.72,
      -radius * 1.02,
      -radius * 0.18,
      -radius * 0.98,
      0,
      -radius * 0.72,
    );
    context.bezierCurveTo(
      radius * 0.18,
      -radius * 0.98,
      radius * 0.72,
      -radius * 1.02,
      radius * 0.78,
      -radius * 0.58,
    );
    context.bezierCurveTo(
      radius * 0.86,
      -radius * 0.08,
      radius * 0.25,
      -radius * 0.15,
      0,
      0,
    );
    context.closePath();
    context.fillStyle = color;
    context.shadowColor = color;
    context.shadowBlur = 4 + radius * 0.18;
    context.fill();
    context.lineWidth = Math.max(1, radius * 0.055);
    context.strokeStyle = cloverOutlineColors[leaf];
    context.stroke();

    context.beginPath();
    context.moveTo(0, -radius * 0.12);
    context.quadraticCurveTo(radius * 0.04, -radius * 0.42, 0, -radius * 0.76);
    context.strokeStyle = cloverVeinColors[leaf];
    context.lineWidth = Math.max(0.7, radius * 0.035);
    context.stroke();
    context.restore();
  }

  context.beginPath();
  context.moveTo(0, radius * 0.12);
  context.quadraticCurveTo(
    radius * 0.08,
    radius * 0.75,
    radius * 0.42,
    radius * 1.18,
  );
  context.strokeStyle = "#087647";
  context.lineWidth = Math.max(1.5, radius * 0.12);
  context.lineCap = "round";
  context.shadowColor = "#169b62";
  context.shadowBlur = radius * 0.14;
  context.stroke();
  context.shadowBlur = 0;
}

function drawParticles(width, height) {
  if (particles.length === 0) {
    initializeParticles(width, height);
  }

  const bassBinCount = Math.min(20, frequency.length);
  let bassEnergy = 0;
  for (let index = 1; index < bassBinCount; index += 1) {
    bassEnergy += frequency[index] / 255;
  }
  bassEnergy = bassBinCount > 1 ? bassEnergy / (bassBinCount - 1) : 0;
  const bassRise = bassEnergy - previousBassEnergy;
  previousBassEnergy = bassEnergy;
  beatCooldown = Math.max(0, beatCooldown - 1);
  if (bassRise > 0.018 && bassEnergy > 0.1 && beatCooldown === 0) {
    beatPulse = 1;
    beatCooldown = 9;
  }
  beatPulse *= 0.9;
  const sharedPulse = Math.sqrt(bassEnergy);
  const connectionDistance = Math.min(width, height) * 0.12;
  for (let index = 0; index < particles.length; index += 1) {
    const particle = particles[index];
    particle.x += particle.velocityX;
    particle.y += particle.velocityY;

    if (particle.x < 0 || particle.x > width) {
      particle.velocityX *= -1;
      particle.x = Math.max(0, Math.min(width, particle.x));
    }
    if (particle.y < 0 || particle.y > height) {
      particle.velocityY *= -1;
      particle.y = Math.max(0, Math.min(height, particle.y));
    }

    const energy = Math.sqrt(frequency[particle.frequencyBin] / 255);
    const pulse = Math.min(
      1,
      Math.max(energy * 0.55, sharedPulse * 0.65) + beatPulse * 0.75,
    );
    const radius =
      particle.size * (1 + pulse * 3.2) + pulse * 7 + beatPulse * 26;
    particle.rotation += particle.spin * (1 + pulse * 3);

    for (
      let otherIndex = index + 1;
      otherIndex < particles.length;
      otherIndex += 1
    ) {
      const other = particles[otherIndex];
      const distanceX = other.x - particle.x;
      const distanceY = other.y - particle.y;
      const distance = Math.hypot(distanceX, distanceY);
      if (distance < connectionDistance) {
        context.beginPath();
        context.moveTo(particle.x, particle.y);
        context.lineTo(other.x, other.y);
        const opacity = (1 - distance / connectionDistance) * 0.22;
        context.strokeStyle = `rgba(125, 137, 170, ${opacity})`;
        context.lineWidth = 0.8;
        context.stroke();
      }
    }

    context.save();
    context.translate(particle.x, particle.y);
    context.rotate(particle.rotation);
    context.globalAlpha = 0.8 + pulse * 0.2;
    drawClover(radius);
    context.restore();
  }

  context.globalAlpha = 1;
  context.shadowBlur = 0;
}

async function initializeAudioVisualizer() {
  if (!audioContext) {
    const AudioContextConstructor =
      window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) {
      throw new Error("This browser does not support audio visualization.");
    }

    audioContext = new AudioContextConstructor();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.68;
    waveform = new Uint8Array(analyser.fftSize);
    frequency = new Uint8Array(analyser.frequencyBinCount);

    const source = audioContext.createMediaElementSource(audio);
    source.connect(analyser);
    analyser.connect(audioContext.destination);
  }

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }
}

function showVisualizerError(error) {
  console.error("Could not start the audio visualizer.", error);
  statusBox.dataset.error = "true";
  errorMessage.textContent = error.message || "Audio visualizer unavailable.";
  errorMessage.hidden = false;
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "0:00";
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function updatePlayerControls() {
  const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  const progress = duration > 0 ? (audio.currentTime / duration) * 100 : 0;
  const volume = audio.muted ? 0 : audio.volume;

  playbackButton.setAttribute("aria-label", audio.paused ? "Play" : "Pause");
  playbackButton.title = audio.paused ? "Play" : "Pause";
  seekSlider.value = String(progress);
  seekSlider.style.setProperty("--progress", `${progress}%`);
  seekSlider.setAttribute(
    "aria-valuetext",
    `${formatTime(audio.currentTime)} of ${formatTime(duration)}`,
  );
  currentTimeLabel.textContent = formatTime(audio.currentTime);
  durationLabel.textContent = formatTime(duration);
  volumeSlider.value = String(volume);
  volumeSlider.style.setProperty("--volume", `${volume * 100}%`);
}

function showPlayerError(error) {
  console.error("Could not play the selected track.", error);
  playerMessage.textContent = error.message || "Couldn't start audio playback.";
}

playbackButton.addEventListener("click", () => {
  playerMessage.textContent = "";
  if (audio.paused) {
    if (audio.ended) {
      audio.currentTime = 0;
    }
    audio.play().catch(showPlayerError);
  } else {
    audio.pause();
  }
});

seekSlider.addEventListener("input", () => {
  if (Number.isFinite(audio.duration)) {
    audio.currentTime = (Number(seekSlider.value) / 100) * audio.duration;
  }
});

volumeSlider.addEventListener("input", () => {
  audio.volume = Number(volumeSlider.value);
  audio.muted = audio.volume === 0;
  updatePlayerControls();
});

trackButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const track = button.dataset.track;
    if (audio.dataset.activeTrack === track) {
      return;
    }

    const position = audio.currentTime;
    const shouldResume = !audio.paused;
    const source = audio.dataset[track];
    const changeId = ++trackChangeId;

    audio.pause();
    audio.dataset.activeTrack = track;
    trackButtons.forEach((trackButton) => {
      const isSelected = trackButton === button;
      trackButton.classList.toggle("is-selected", isSelected);
      trackButton.setAttribute("aria-pressed", String(isSelected));
    });
    playerMessage.textContent = "";

    audio.src = source;
    audio.addEventListener(
      "loadedmetadata",
      () => {
        if (changeId !== trackChangeId) {
          return;
        }
        audio.currentTime = Math.min(position, audio.duration);
        updatePlayerControls();
        if (shouldResume) {
          audio.play().catch(showPlayerError);
        }
      },
      { once: true },
    );
    audio.load();
  });
});

[
  "durationchange",
  "loadedmetadata",
  "timeupdate",
  "play",
  "pause",
  "ended",
  "volumechange",
].forEach((eventName) => {
  audio.addEventListener(eventName, updatePlayerControls);
});
audio.addEventListener("error", () => {
  if (audio.error?.code === MediaError.MEDIA_ERR_ABORTED) {
    return;
  }
  const error = new Error("The selected audio track couldn't be loaded.");
  console.error(error);
  playerMessage.textContent = error.message;
});
updatePlayerControls();

audio.addEventListener("play", async () => {
  pageLayout?.classList.add("is-playing");
  statusBox.dataset.error = "false";
  errorMessage.hidden = true;
  try {
    await initializeAudioVisualizer();
    if (animationFrame === null) {
      animateVisualizer();
    }
  } catch (error) {
    showVisualizerError(error);
  }
});

function stopVisualizer() {
  if (animationFrame !== null) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }
  drawVisualizer();
}

function selectVisualizer(type) {
  visualizerType = type;
  visualizerButtons.forEach((button) => {
    const isSelected = button.dataset.visualizer === type;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
  const visualizerLabels = {
    waveform: "waveform",
    frequency: "frequency spectrum",
    radial: "radial frequency spectrum",
    particles: "reactive particles",
    terrain: "mountain terrain waveform",
  };
  const label = visualizerLabels[visualizerType];
  canvas.setAttribute("aria-label", `Live audio ${label}`);
  canvas.textContent = `Live audio ${label}`;
  errorMessage.hidden = true;
  statusBox.dataset.error = "false";
  if (visualizerType === "particles") {
    const { width, height } = visualizerStage.getBoundingClientRect();
    initializeParticles(width, height);
  }
  drawVisualizer();
}

function chooseRandomVisualizer() {
  const availableVisualizers = Array.from(visualizerButtons)
    .map((button) => button.dataset.visualizer)
    .filter((type) => type !== visualizerType);
  const randomIndex = Math.floor(Math.random() * availableVisualizers.length);
  selectVisualizer(availableVisualizers[randomIndex]);
}

visualizerButtons.forEach((button) => {
  button.addEventListener("click", () => {
    clearInterval(randomVisualsInterval);
    randomVisualsInterval = null;
    randomVisualizerButton.classList.remove("is-selected");
    randomVisualizerButton.setAttribute("aria-pressed", "false");
    selectVisualizer(button.dataset.visualizer);
  });
});

randomVisualizerButton.addEventListener("click", () => {
  if (randomVisualsInterval !== null) {
    clearInterval(randomVisualsInterval);
    randomVisualsInterval = null;
    randomVisualizerButton.classList.remove("is-selected");
    randomVisualizerButton.setAttribute("aria-pressed", "false");
    return;
  }

  randomVisualizerButton.classList.add("is-selected");
  randomVisualizerButton.setAttribute("aria-pressed", "true");
  chooseRandomVisualizer();
  randomVisualsInterval = setInterval(chooseRandomVisualizer, 10_000);
});

audio.addEventListener("pause", stopVisualizer);
audio.addEventListener("ended", stopVisualizer);

if ("ResizeObserver" in window) {
  new ResizeObserver(resizeCanvas).observe(visualizerStage);
} else {
  window.addEventListener("resize", resizeCanvas);
}

resizeCanvas();

const lyricLeadIn = 0.85;
const lyricsOverlay = document.querySelector(".lyrics-overlay");

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
    // wordElement.style.color = "rgba(30, 32, 34, 0.35)";
    wordElement.style.color = "rgb(200,200,200)";

    wordElement.style.transition = "color 100ms linear";
    lyricWords.push(wordElement);
    fragment.append(wordElement);
  });

  if (cue?.words.length) {
    lyricsOverlay.style.textAlign = "center";
    lyricsOverlay.style.fontWeight = "600";
    lyricsOverlay.style.lineHeight = "1.5";
  }

  lyricsOverlay.replaceChildren(fragment);
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
      // wordElement.style.color = "rgba(30, 32, 34, 0.35)";
      wordElement.style.color = "rgb(200,200,200)";
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
    const response = await fetch("assets/json/snow-patrol-chasing-cars.json");
    if (!response.ok) {
      throw new Error(`Couldn't load lyrics (${response.status}).`);
    }

    cues = parseWordLyrics(await response.text());
    if (cues.length === 0) {
      throw new Error("The lyrics file contains no usable lyric cues.");
    }
    updateActiveCue(audio.currentTime);
  } catch (error) {
    lyricsOverlay.textContent = error.message || "Couldn't load the lyrics.";
    statusBox.dataset.error = "true";
    console.error("Couldn't load karaoke lyrics.", error);
  }
}

if (!audio || !statusBox || !lyricsOverlay) {
  throw new Error(
    "The karaoke page is missing its audio player, status box, or lyrics overlay.",
  );
}

audio.addEventListener(
  "loadedmetadata",
  () => {
    audio.currentTime = Math.min(0, audio.duration);
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
