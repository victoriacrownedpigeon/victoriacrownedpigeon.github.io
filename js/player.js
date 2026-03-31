const ITEM_H = 40;  // Critical: Matches the 40px CSS row height
const SLOT_INDEX = 1;  
const PX_PER_SONG = 5; 
const ROZETKA_DATA = "images/rozetka-gemini.svg";   

const playlist = document.getElementById('playlist'); 
const audio = document.getElementById('audio'); 
const player = document.getElementById('player'); 
const stage = document.getElementById('cover-stage'); 
const volSlider = document.getElementById('volume-slider'); 
const speedSlider = document.getElementById('speed-slider'); 
const trackCounter = document.getElementById('track-counter'); 

// Podcast Player (Player 2)
const playlist2 = document.getElementById('playlist-2'); 
const audio2 = document.getElementById('audio-2'); 
const player2 = document.getElementById('player-2');
const stage2 = document.getElementById('cover-stage-2');
const counter2 = document.getElementById('track-counter-2');

// Global state
let coverEls = []; 
let coverEls2 = []; 
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
let sDownX = 0, sDownY = 0; 

let loopMode = parseInt(localStorage.getItem('aimp_loop')) || 2;   
let isShuffle = localStorage.getItem('aimp_shuf') === 'true'; 

const updateUI = () => { 
    document.getElementById('btn-loop-one').classList.toggle('active', loopMode === 1); 
    document.getElementById('btn-loop-all').classList.toggle('active', loopMode === 2); 
    document.getElementById('btn-shuffle').classList.toggle('active', isShuffle); 
}; 

// UI Handlers
document.getElementById('btn-loop-one').onclick = () => { loopMode = (loopMode === 1) ? 0 : 1; localStorage.setItem('aimp_loop', loopMode); updateUI(); }; 
document.getElementById('btn-loop-all').onclick = () => { loopMode = (loopMode === 2) ? 0 : 2; localStorage.setItem('aimp_loop', loopMode); updateUI(); }; 
document.getElementById('btn-shuffle').onclick = () => { isShuffle = !isShuffle; localStorage.setItem('aimp_shuf', isShuffle); updateUI(); }; 

volSlider.onmousedown = (e) => e.stopPropagation(); 
volSlider.oninput = (e) => { audio.volume = e.target.value; localStorage.setItem('aimp_vol', audio.volume); }; 

speedSlider.onmousedown = (e) => { e.stopPropagation(); sDownX = e.clientX; sDownY = e.clientY; }; 
speedSlider.oninput = (e) => { audio.playbackRate = parseFloat(e.target.value); localStorage.setItem('aimp_speed', e.target.value); }; 
speedSlider.onclick = (e) => { if (Math.hypot(e.clientX - sDownX, e.clientY - sDownY) < 3) { speedSlider.value = 1.0; audio.playbackRate = 1.0; localStorage.setItem('aimp_speed', 1.0); } }; 

// Metadata Scanner
async function scanTrack(li) {
    const url = li.getAttribute('data-id');
    const metaEl = li.querySelector('.meta-line');
    try {
        const response = await fetch(url, { method: 'HEAD' });
        const sizeBytes = parseInt(response.headers.get('content-length'));
        const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(1) + "MB";
        const ext = url.split('.').pop().toUpperCase();
        const temp = new Audio(url);
        
        temp.onloadedmetadata = () => {
            const duration = temp.duration;
            const m = Math.floor(duration / 60);
            const s = Math.floor(duration % 60).toString().padStart(2, '0');
            const rawBitrate = ((sizeBytes * 8) / duration) / 1000;
            const standards = [32, 64, 96, 112, 128, 160, 192, 224, 256, 320];
            const closest = standards.reduce((prev, curr) => Math.abs(curr - rawBitrate) < Math.abs(prev - rawBitrate) ? curr : prev);
            let finalBitrate = (rawBitrate > 400 || Math.abs(rawBitrate - closest) > (closest * 0.05)) ? Math.round(rawBitrate) : closest;
            
            metaEl.innerHTML = `<span>${ext} | 44.1kHz | ${finalBitrate}kbps | ${sizeMB}</span><span>${m}:${s}</span>`;
            temp.src = ""; temp.load();
        };
    } catch(e) { metaEl.textContent = "0:00 | MP3 | 44.1kHz | ---kbps | 0.0MB"; }
}

// Cover Loading 
function loadCover(url, targetDiv) { 
    if (!url || !targetDiv) return;   
    const art = targetDiv.querySelector('.cover-art'); 
    if (!art) return; 
    if (coverCache[url]) { applyStyles(art, coverCache[url]); return; } 

    if (typeof jsmediatags !== 'undefined') {
        jsmediatags.read(new URL(url, window.location.href).href, { 
            onSuccess: (tag) => { 
                const pic = tag.tags.picture; 
                if (pic) { 
                    const base64 = `data:${pic.format};base64,${window.btoa(Array.from(pic.data).map(b => String.fromCharCode(b)).join(''))}`; 
                    coverCache[url] = base64; applyStyles(art, base64); 
                } else { useFallback(url, art); } 
            }, 
            onError: () => useFallback(url, art) 
        });
    } else { useFallback(url, art); }
} 

function applyStyles(el, imgUrl) { 
    el.style.backgroundImage = `url("${imgUrl}")`; 
    el.style.backgroundSize = (imgUrl.includes("rozetka-gemini.svg")) ? "contain" : "cover"; 
    el.style.backgroundPosition = "center"; 
    el.style.backgroundRepeat = "no-repeat"; 
} 

function useFallback(url, art) { applyStyles(art, ROZETKA_DATA); coverCache[url] = ROZETKA_DATA; } 

// Refreshes specific cover sets
function refreshCovers(items, jumpOffset = 0, targetCoverEls = coverEls) { 
    const classes = ['pos-hidden-left', 'pos-prev', 'pos-active', 'pos-next-1', 'pos-next-2', 'pos-hidden-right']; 
    const offsets = [-2, -1, 0, 1, 2, 3]; 

    requestAnimationFrame(() => { 
        offsets.forEach((offset, idx) => { 
            const itemIdx = (SLOT_INDEX + offset + jumpOffset + items.length) % items.length;
            const item = items[itemIdx]; 
            if (item && targetCoverEls[idx]) { 
                loadCover(item.getAttribute('data-id'), targetCoverEls[idx]); 
                targetCoverEls[idx].className = 'cover-item ' + classes[idx]; 
            } 
        }); 
    }); 
}

// Universal Jump Function
function performJump(steps, targetList = playlist, targetCoverEls = coverEls) { 
    if (isAnimating || steps === 0) return; 
    isAnimating = true; 
    const direction = steps > 0 ? 1 : -1; 
    const absSteps = Math.abs(steps); 
    const currentItems = Array.from(targetList.children);
    const targetIdx = (SLOT_INDEX + steps + currentItems.length) % currentItems.length;
    const clickedLi = currentItems[targetIdx];

    if (clickedLi) {
        currentItems.forEach(li => li.classList.remove('active'));
        clickedLi.classList.add('active');
        clickedLi.style.setProperty('--prog', '0%');
        const targetAudio = (targetList.id === 'playlist-2') ? audio2 : audio;
        const url = clickedLi.getAttribute('data-id');
        if (targetList.id === 'playlist') currentPlayingUrl = url;
        targetAudio.src = encodeURI(url);
        targetAudio.play().catch(() => {});
    }

    if (direction < 0) {
        for (let i = 0; i < absSteps; i++) targetList.insertBefore(targetList.lastElementChild, targetList.firstElementChild);
        targetList.style.transition = "none";
        targetList.style.transform = `translateY(${steps * ITEM_H}px)`;
        void targetList.offsetHeight; 
    }

    targetList.style.transition = "transform 0.8s cubic-bezier(0.45, 0.05, 0.55, 0.95)";  
    targetList.style.transform = direction > 0 ? `translateY(${-steps * ITEM_H}px)` : "translateY(0px)";

    for (let i = 0; i < absSteps; i++) {
        if (direction > 0) {
            let el = targetCoverEls.shift(); el.className = 'cover-item pos-spawn-right'; 
            void el.offsetHeight; targetCoverEls.push(el); 
        } else {
            let el = targetCoverEls.pop(); el.className = 'cover-item pos-spawn-left'; 
            void el.offsetHeight; targetCoverEls.unshift(el);
        }
    }
    refreshCovers(currentItems, steps, targetCoverEls); 

    setTimeout(() => { 
        targetList.style.transition = "none"; targetList.style.transform = "translateY(0px)"; 
        if (direction > 0) for (let i = 0; i < absSteps; i++) targetList.appendChild(targetList.firstElementChild);  
        refreshCovers(Array.from(targetList.children), 0, targetCoverEls);
        setTimeout(() => { isAnimating = false; }, 50); 
    }, 800); 
}

const master = document.getElementById('master-container');
master.onmousedown = (e) => { 
    if (e.target.closest('.controls-shared') || e.target.closest('#controls') || e.target.type === 'range' || e.target.closest('button')) return; 
    unlocked = true; dragged = false; dragMode = null; 
    startX = lastX = e.clientX; startY = lastY = e.clientY; 
    const rect = master.getBoundingClientRect(); 
    offX = e.clientX - rect.left; offY = e.clientY - rect.top; 
}; 

document.onmousemove = (e) => { 
    if (!unlocked) return; 
    const deltaX = e.clientX - startX; 
    const deltaY = e.clientY - startY; 
    if (!dragMode && (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4)) { 
        if (e.target.closest('li.active')) dragMode = (Math.abs(deltaY) > Math.abs(deltaX)) ? 'scroll' : 'scrub'; 
        else if (e.target.closest('#playlist-container') || e.target.closest('#playlist-container-2')) dragMode = (Math.abs(deltaY) > Math.abs(deltaX)) ? 'scroll' : 'move'; 
        else dragMode = 'move'; 
    } 
    if (dragMode === 'move') { 
        dragged = true; master.style.left = (e.clientX - offX) + 'px'; master.style.top = (e.clientY - offY) + 'px'; 
    } else if (dragMode === 'scroll') { 
        dragged = true; 
        if (Math.abs(e.clientY - lastY) >= PX_PER_SONG) { 
            const isP2 = e.target.closest('#playlist-container-2');
            performJump(e.clientY > lastY ? -1 : 1, isP2 ? playlist2 : playlist, isP2 ? coverEls2 : coverEls); 
            lastY = e.clientY; 
        } 
    } else if (dragMode === 'scrub') { dragged = true; scrub(e); } 
}; 

document.onmouseup = (e) => { 
    if (dragged && dragMode === 'move') { 
        localStorage.setItem('aimp_player_left', master.style.left); localStorage.setItem('aimp_player_top', master.style.top); 
    } 
    if (!dragged && unlocked) { 
        const li = e.target.closest('li'), cover = e.target.closest('.cover-item'); 
        if (li) {
            const parentList = li.parentElement; 
            const idx = Array.from(parentList.children).indexOf(li);
            if (idx === SLOT_INDEX) { if (parentList.id === 'playlist') scrub(e); } 
            else performJump(idx - SLOT_INDEX, parentList, parentList.id === 'playlist-2' ? coverEls2 : coverEls);
        } else if (cover) { 
            const isP1 = e.target.closest('#cover-stage');
            const targetList = isP1 ? playlist : playlist2;
            const targetCovers = isP1 ? coverEls : coverEls2;
            const targetAudio = isP1 ? audio : audio2;
            if (cover.classList.contains('pos-prev')) performJump(-1, targetList, targetCovers); 
            else if (cover.classList.contains('pos-next-1')) performJump(1, targetList, targetCovers); 
            else if (cover.classList.contains('pos-next-2')) performJump(2, targetList, targetCovers); 
            else if (cover.classList.contains('pos-active')) targetAudio.paused ? targetAudio.play() : targetAudio.pause(); 
        } 
    }
    unlocked = dragged = false; 
};

function scrub(e) { 
    const activeLi = playlist.querySelector('li.active'); 
    if (activeLi && audio.duration) { 
        const rect = activeLi.getBoundingClientRect(); 
        let pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)); 
        audio.currentTime = pct * audio.duration; 
    } 
} 

function runTickerLoop() { 
    const activeLi = playlist.querySelector('li.active');
    if (activeLi && !audio.paused) {
        const url = activeLi.getAttribute('data-id'), inner = activeLi.querySelector('.scroll-inner');
        if (inner) {
            if (tickerState[url] === undefined) tickerState[url] = -50;
            tickerState[url] += (0.05 * audio.playbackRate);
            if (tickerState[url] >= 0) tickerState[url] = -50;
            inner.style.transform = `translateX(${tickerState[url]}%)`;
        }
    }
    Object.keys(tickerState).forEach(url => {
        if ((url !== currentPlayingUrl || audio.paused) && tickerState[url] > -50) {
            tickerState[url] -= 0.15; 
            if (tickerState[url] < -50) tickerState[url] = -50;
            const li = playlist.querySelector(`li[data-id="${url}"]`);
            if (li && li.querySelector('.scroll-inner')) li.querySelector('.scroll-inner').style.transform = `translateX(${tickerState[url]}%)`;
        }
    });
    requestAnimationFrame(runTickerLoop);
}

audio.onplay = () => player.classList.replace('paused', 'playing'); 
audio.onpause = () => player.classList.replace('playing', 'paused'); 
audio2.onplay = () => player2.classList.replace('paused', 'playing');
audio2.onpause = () => player2.classList.replace('playing', 'paused');
audio.ontimeupdate = () => { 
    const activeLi = playlist.querySelector('li.active'); 
    if (activeLi && audio.duration) activeLi.style.setProperty('--prog', (audio.currentTime/audio.duration)*100 + '%'); 
}; 
audio.onended = () => { 
    if (loopMode === 1) { audio.currentTime = 0; audio.play(); } 
    else if (isShuffle) performJump(Math.floor(Math.random() * (playlist.children.length - 1)) - SLOT_INDEX); 
    else if (loopMode === 2) performJump(1); 
}; 

const init = () => { 
    coverEls = Array.from(stage.querySelectorAll('.cover-item')); 
    coverEls2 = Array.from(stage2.querySelectorAll('.cover-item'));
    const savedLeft = localStorage.getItem('aimp_player_left'), savedTop = localStorage.getItem('aimp_player_top'); 
    if (savedLeft && savedTop && master) { master.style.left = savedLeft; master.style.top = savedTop; } 
    
    audio.volume = localStorage.getItem('aimp_vol') || 0.143; 
    volSlider.value = audio.volume; 
    speedSlider.value = localStorage.getItem('aimp_speed') || 1.0; 
    audio.playbackRate = parseFloat(speedSlider.value); 
    audio2.volume = 0.5;

    const lastTrackUrl = localStorage.getItem('aimp_last_track'); 
    if (lastTrackUrl) { 
        const items = Array.from(playlist.children), idx = items.findIndex(li => li.getAttribute('data-id') === lastTrackUrl); 
        if (idx !== -1) { 
            const diff = idx - SLOT_INDEX; 
            for (let i = 0; i < Math.abs(diff); i++) diff > 0 ? playlist.appendChild(playlist.firstElementChild) : playlist.insertBefore(playlist.lastElementChild, playlist.firstElementChild); 
        } 
    } 
    
    if (playlist.children[SLOT_INDEX]) { 
        playlist.children[SLOT_INDEX].classList.add('active');
        currentPlayingUrl = playlist.children[SLOT_INDEX].getAttribute('data-id'); 
        audio.src = encodeURI(currentPlayingUrl); 
    } 
    if (playlist2.children[SLOT_INDEX]) {
        playlist2.children[SLOT_INDEX].classList.add('active');
        audio2.src = encodeURI(playlist2.children[SLOT_INDEX].getAttribute('data-id'));
    }
    
    if (counter2) counter2.textContent = playlist2.querySelectorAll('li').length; 
    if (trackCounter) trackCounter.textContent = playlist.querySelectorAll('li').length; 

    updateUI(); 
    refreshCovers(Array.from(playlist.children), 0, coverEls); 
    refreshCovers(Array.from(playlist2.children), 0, coverEls2); 
    runTickerLoop(); 
    Array.from(playlist.children).forEach(li => scanTrack(li));
    Array.from(playlist2.children).forEach(li => scanTrack(li));
}; 

document.addEventListener('DOMContentLoaded', init);