const audio = document.querySelector("audio");
const audioTimeUpdate = document.getElementById("timeupdate");
const audioStatus = document.getElementById("status");
const playButton = document.getElementById("play-audio");
const pauseButton = document.getElementById("pause-audio");
const playbackError = document.getElementById("playback-error");

audio.addEventListener("focus", () => {
  audio.blur();
});

audio.addEventListener("play", () => {
  playbackError.hidden = true;
});

playButton.addEventListener("click", async () => {
  playbackError.hidden = true;
  try {
    await audio.play();
  } catch (error) {
    if (error.name === "AbortError") {
      return;
    }
    playbackError.textContent = error.message || "Could not start audio playback.";
    playbackError.hidden = false;
  }
});

pauseButton.addEventListener("click", () => {
  audio.pause();
});

audio.addEventListener("timeupdate", () => {
  audioTimeUpdate.textContent = `Current Time: ${audio.currentTime.toFixed(2)} seconds`;
});

audio.addEventListener("play", () => {
  audioStatus.textContent = "Status: Playing";
});

audio.addEventListener("pause", () => {
  audioStatus.textContent = "Status: Paused";
});

audio.addEventListener("ended", () => {
  audioStatus.textContent = "Status: Ended";
});

audio.addEventListener("seeking", () => {
  audioStatus.textContent = "Status: Seeking";
});

audio.addEventListener("seeked", () => {
  audioStatus.textContent = "Status: Seeked";
});
