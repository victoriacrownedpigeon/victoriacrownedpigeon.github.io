/**
 * player.js
 * Handles music logic, cover animations, and draggable interface.
 */

const ITEM_H = 20; 
const SLOT_INDEX = 1; 
const PX_PER_SONG = 3;
const ROZETKA_DATA = "images/rozetka-gemini.svg"; 

const playlist = document.getElementById('playlist');
const audio = document.getElementById('audio');
const player = document.getElementById('player');
const stage = document.getElementById('cover-stage');
const volSlider = document.getElementById('volume-slider');
const speedSlider = document.getElementById('speed-slider');

let coverEls = [];
let isAnimating = false;
let currentPlayingUrl = "";
let unlocked = false;
let dragged = false;
let tickerState = {};
let coverCache = {};

let offX = 0, offY = 0;
let startX = 0, startY = 0;
let lastX = 0, lastY = 0;
let dragMode = null;

let sDownX = 0;
let sDownY = 0;

let loopMode = parseInt(localStorage.getItem('aimp_loop')) || 2;  
let isShuffle = localStorage.getItem('aimp_shuf') === 'true';

const updateUI = () => {
    document.getElementById('btn-loop-one').classList.toggle('active', loopMode === 1);
    document.getElementById('btn-loop-all').classList.toggle('active', loopMode === 2);
    document.getElementById('btn-shuffle').classList.toggle('active', isShuffle);
};

// UI Control Handlers
document.getElementById('btn-loop-one').onclick = () => { 
    loopMode = (loopMode === 1) ? 0 : 1; 
    localStorage.setItem('aimp_loop', loopMode); 
    updateUI(); 
};
document.getElementById('btn-loop-all').onclick = () => { 
    loopMode = (loopMode === 2) ? 0 : 2; 
    localStorage.setItem('aimp_loop', loopMode); 
    updateUI(); 
};
document.getElementById('btn-shuffle').onclick = () => { 
    isShuffle = !isShuffle; 
    localStorage.setItem('aimp_shuf', isShuffle); 
    updateUI(); 
};

volSlider.onmousedown = (e) => e.stopPropagation();
volSlider.oninput = (e) => { 
    audio.volume = e.target.value; 
    localStorage.setItem('aimp_vol', audio.volume); 
};

speedSlider.onmousedown = (e) => {
    e.stopPropagation();
    sDownX = e.clientX;
    sDownY = e.clientY;
};

speedSlider.oninput = (e) => {
    let currentSpeed = parseFloat(e.target.value);
    audio.playbackRate = currentSpeed;
    localStorage.setItem('aimp_speed', currentSpeed);
};

speedSlider.onclick = (e) => {
    const dist = Math.hypot(e.clientX - sDownX, e.clientY - sDownY);
    if (dist < 3) {
        speedSlider.value = 1.0;
        audio.playbackRate = 1.0;
        localStorage.setItem('aimp_speed', 1.0);
    }
};

// Cover Loading Logic
function loadCover(url, targetDiv) {
    if (!url || !targetDiv) return;  
    const art = targetDiv.querySelector('.cover-art');
    if (!art) return;
    
    if (coverCache[url]) {  
        applyStyles(art, coverCache[url]);
        return;  
    }

    jsmediatags.read(new URL(url, window.location.href).href, {
        onSuccess: (tag) => {
            const pic = tag.tags.picture;
            if (pic) {
                const base64 = `data:${pic.format};base64,${window.btoa(Array.from(pic.data).map(b => String.fromCharCode(b)).join(''))}`;
                coverCache[url] = base64;  
                applyStyles(art, base64);
            } else { useFallback(url, art); }
        },
        onError: () => useFallback(url, art)
    });
}

function applyStyles(el, imgUrl) {
    el.style.backgroundImage = `url("${imgUrl}")`;
    el.style.backgroundSize = (imgUrl.includes("rozetka-gemini.svg")) ? "contain" : "cover";
    el.style.backgroundPosition = "center";
    el.style.backgroundRepeat = "no-repeat";
}

function useFallback(url, art) {  
    applyStyles(art, ROZETKA_DATA);  
    coverCache[url] = ROZETKA_DATA;  
}

// Playback & Animation
function performJump(steps) {
    if (isAnimating || steps === 0) return;
    isAnimating = true; 
    const direction = steps > 0 ? 1 : -1;
    const absSteps = Math.abs(steps);
    const items = Array.from(playlist.children);
    const targetLi = items[SLOT_INDEX + steps];
    
    if (!targetLi) { isAnimating = false; return; }
    
    items.forEach(li => li.classList.remove('active'));
    targetLi.classList.add('active'); 
    currentPlayingUrl = targetLi.getAttribute('data-id');
    localStorage.setItem('aimp_last_track', currentPlayingUrl);
    
    audio.src = encodeURI(currentPlayingUrl); 
    audio.playbackRate = parseFloat(speedSlider.value); 
    audio.play().catch(() => {});
    
    playlist.style.transition = "transform 0.1s linear"; 
    playlist.style.transform = `translateY(${-steps * ITEM_H}px)`;
    
    setTimeout(() => {
        playlist.style.transition = "none"; 
        playlist.style.transform = "translateY(0px)";
        for (let i = 0; i < absSteps; i++) {
            if (direction > 0) {
                playlist.appendChild(playlist.firstElementChild); 
                let el = coverEls.shift(); 
                el.className = 'cover-item pos-spawn-right'; 
                void el.offsetHeight; 
                coverEls.push(el);
            } else {
                playlist.insertBefore(playlist.lastElementChild, playlist.firstElementChild); 
                let el = coverEls.pop(); 
                el.className = 'cover-item pos-spawn-left'; 
                void el.offsetHeight; 
                coverEls.unshift(el);
            }
        }
        refreshCovers();
        setTimeout(() => { isAnimating = false; }, 50);
    }, 100);
}

function refreshCovers() {
    const updatedItems = Array.from(playlist.children);
    const classes = ['pos-hidden-left', 'pos-prev', 'pos-active', 'pos-next-1', 'pos-next-2', 'pos-hidden-right'];
    const offsets = [-2, -1, 0, 1, 2, 3];
    
    requestAnimationFrame(() => {
        offsets.forEach((offset, idx) => {
            const item = updatedItems[(SLOT_INDEX + offset + updatedItems.length) % updatedItems.length];
            if (item && coverEls[idx]) {
                loadCover(item.getAttribute('data-id'), coverEls[idx]);
                coverEls[idx].className = 'cover-item ' + classes[idx];
            }
        });
    });
}

// Drag & Drop Logic
player.onmousedown = (e) => { 
    if (e.target.closest('#controls') || e.target.type === 'range' || e.target.closest('button')) return; 
    
    unlocked = true; 
    dragged = false; 
    dragMode = null; 
    
    startX = lastX = e.clientX; 
    startY = lastY = e.clientY; 
    
    const rect = player.getBoundingClientRect();
    offX = e.clientX - rect.left; 
    offY = e.clientY - rect.top; 
};

document.onmousemove = (e) => {
    if (!unlocked) return; 
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;

    if (!dragMode && (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2)) {
        if (e.target.closest('li.active')) dragMode = (Math.abs(deltaY) > Math.abs(deltaX)) ? 'scroll' : 'scrub';
        else if (e.target.closest('#playlist-container')) dragMode = (Math.abs(deltaY) > Math.abs(deltaX)) ? 'scroll' : 'move';
        else dragMode = 'move';
    }

    if (dragMode === 'move') { 
        dragged = true; 
        player.style.right = 'auto';
        player.style.bottom = 'auto';
        player.style.left = (e.clientX - offX) + 'px'; 
        player.style.top = (e.clientY - offY) + 'px'; 
    }
    else if (dragMode === 'scroll') { 
        dragged = true; 
        if (Math.abs(e.clientY - lastY) >= PX_PER_SONG) { 
            performJump(e.clientY > lastY ? -1 : 1); 
            lastY = e.clientY; 
        } 
    }
    else if (dragMode === 'scrub') { dragged = true; scrub(e); }
};

document.onmouseup = (e) => {
    // SAVE POSITION after move
    if (dragged && dragMode === 'move') {
        localStorage.setItem('aimp_player_left', player.style.left);
        localStorage.setItem('aimp_player_top', player.style.top);
    }

    if (!dragged && unlocked) {
        const li = e.target.closest('li'), cover = e.target.closest('.cover-item');
        if (li && li.classList.contains('active')) scrub(e);
        else if (li) performJump(Array.from(playlist.children).indexOf(li) - SLOT_INDEX);
        else if (cover) {
            if (cover.classList.contains('pos-prev')) performJump(-1);
            else if (cover.classList.contains('pos-next-1')) performJump(1);
            else if (cover.classList.contains('pos-next-2')) performJump(2);
            else if (cover.classList.contains('pos-active')) audio.paused ? audio.play() : audio.pause();
        }
    }
    unlocked = dragged = false;
};

function scrub(e) {
    const activeLi = playlist.querySelector('li.active');
    if (activeLi && audio.duration) { 
        const rect = activeLi.getBoundingClientRect(); 
        let pct = (e.clientX - rect.left) / rect.width;
        pct = Math.max(0, Math.min(1, pct)); // Safety clamp
        audio.currentTime = pct * audio.duration; 
    }
}

function runTickerLoop() {
    Array.from(playlist.children).forEach(li => {
        const url = li.getAttribute('data-id'), inner = li.querySelector('.scroll-inner');
        if (!inner) return;
        
        // Only run logic if it's the active track OR if it's still "resetting" back to -50
        if (url === currentPlayingUrl && !audio.paused) {
            if (tickerState[url] === undefined) tickerState[url] = -50;
            tickerState[url] += (0.04 * audio.playbackRate);
            if (tickerState[url] >= 0) tickerState[url] = -50;
            inner.style.transform = `translateX(${tickerState[url]}%)`;
        } else if (tickerState[url] > -50) {
            tickerState[url] -= 0.18;
            if (tickerState[url] < -50) tickerState[url] = -50;
            inner.style.transform = `translateX(${tickerState[url]}%)`;
        }
    });
    requestAnimationFrame(runTickerLoop);
}

audio.onplay = () => player.classList.replace('paused', 'playing');
audio.onpause = () => player.classList.replace('playing', 'paused');

audio.ontimeupdate = () => {
    const activeLi = playlist.querySelector('li.active');
    if (activeLi && audio.duration) {
        activeLi.style.setProperty('--prog', (audio.currentTime/audio.duration)*100 + '%');
    }
};

audio.onended = () => {
    if (loopMode === 1) { audio.currentTime = 0; audio.play(); } 
    else if (isShuffle) { performJump(Math.floor(Math.random() * (playlist.children.length - 1)) - SLOT_INDEX); } 
    else if (loopMode === 2) { performJump(1); }
};

// Initialize
const init = () => {
    coverEls = Array.from(stage.querySelectorAll('.cover-item'));

    // RESTORE POSITION
    const savedLeft = localStorage.getItem('aimp_player_left');
    const savedTop = localStorage.getItem('aimp_player_top');
    if (savedLeft && savedTop) {
        player.style.right = 'auto'; 
        player.style.left = savedLeft;
        player.style.top = savedTop;
    }

    audio.volume = localStorage.getItem('aimp_vol') || 0.143;
    volSlider.value = audio.volume;
    
    const savedSpeed = localStorage.getItem('aimp_speed') || 1.0;
    speedSlider.value = savedSpeed;
    audio.playbackRate = parseFloat(savedSpeed);

    const lastTrackUrl = localStorage.getItem('aimp_last_track');
    if (lastTrackUrl) {
        const items = Array.from(playlist.children);
        const idx = items.findIndex(li => li.getAttribute('data-id') === lastTrackUrl);
        if (idx !== -1) {
            const diff = idx - SLOT_INDEX;
            for (let i = 0; i < Math.abs(diff); i++) {
                if (diff > 0) playlist.appendChild(playlist.firstElementChild);
                else playlist.insertBefore(playlist.lastElementChild, playlist.firstElementChild);
            }
        }
    }
    
    const activeItem = playlist.children[SLOT_INDEX];
    if (activeItem) { 
        currentPlayingUrl = activeItem.getAttribute('data-id');  
        audio.src = encodeURI(currentPlayingUrl);  
        activeItem.classList.add('active'); 
    }
    
    updateUI();
    refreshCovers(); 
    runTickerLoop();
};

document.addEventListener('DOMContentLoaded', init);