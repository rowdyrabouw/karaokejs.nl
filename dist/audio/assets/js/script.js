const audio = document.querySelector("audio");
const audioTimeUpdate = document.getElementById("timeupdate");
const audioStatus = document.getElementById("status");

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
