const images = ['images/Carol.jpg', 'images/Elky.jpg', 'images/Hershel.jpg', 'images/Swinger.jpg'];
let current = 0;

const bg1 = document.getElementById('bg1');
const bg2 = document.getElementById('bg2');
const audio = document.getElementById('audio');

let started = false;
let showingBg1 = true;

// initial state
bg1.style.backgroundImage = `url(${images[current]})`;
bg1.style.opacity = 1;
bg2.style.opacity = 0;

// --- reusable function ---
function nextBackground() {
  // start audio once
  if (!started) {
    audio.play().catch(() => {});
    started = true;
  }

  current = (current + 1) % images.length;

  let topLayer = showingBg1 ? bg2 : bg1;
  let bottomLayer = showingBg1 ? bg1 : bg2;

  topLayer.style.backgroundImage = `url(${images[current]})`;
  topLayer.offsetHeight; // ensure transition works
  topLayer.style.opacity = 1;
  bottomLayer.style.opacity = 0;

  showingBg1 = !showingBg1;
}

// --- click ---
document.body.addEventListener('click', nextBackground);

// --- space key ---
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    nextBackground();
  }
});