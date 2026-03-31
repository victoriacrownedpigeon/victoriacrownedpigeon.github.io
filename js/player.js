/** * player.js - Peahen Stealth Edition
 * Optimized for 40px rows and 260px player height.
 */ 

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

if (trackCounter && playlist) { 
    trackCounter.textContent = playlist.querySelectorAll('li').length; 
} 

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

// Metadata Scanner with Standardized Bitrate Snapping
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
            
            // Bitrate Logic: Standard-First (snaps to clean numbers like 320)
            const rawBitrate = ((sizeBytes * 8) / duration) / 1000;
            const standards = [32, 64, 96, 112, 128, 160, 192, 224, 256, 320];
            const closest = standards.reduce((prev, curr) => 
                Math.abs(curr - rawBitrate) < Math.abs(prev - rawBitrate) ? curr : prev
            );

            let finalBitrate;
            if (rawBitrate > 400) {
                finalBitrate = Math.round(rawBitrate); // Show raw for Lossless/Warning
            } else if (Math.abs(rawBitrate - closest) < (closest * 0.05)) {
                finalBitrate = closest; // Snap to 320, 256, etc.
            } else {
                finalBitrate = Math.round(rawBitrate); // Show raw for VBR (e.g. 284)
            }
            
            // We put the technical specs in one span (Left) and the time in another (Right)
            metaEl.innerHTML = `
                <span>${ext} | 44.1kHz | ${finalBitrate}kbps | ${sizeMB}</span>
                <span>${m}:${s}</span>
            `;
            
            // Memory Cleanup
            temp.src = "";
            temp.load();
        };
    } catch(e) { 
        metaEl.textContent = "0:00 | MP3 | 44.1kHz | ---kbps | 0.0MB"; 
    }
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

// Movement Logic
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
    audio.load();
    audio.play().catch(() => {}); 
    
    playlist.style.transition = "transform 0.5s cubic-bezier(0.45, 0.05, 0.55, 0.95)";  
    playlist.style.transform = `translateY(${-steps * ITEM_H}px)`;
    
    setTimeout(() => { 
        playlist.style.transition = "none";  
        playlist.style.transform = "translateY(0px)"; 
        for (let i = 0; i < absSteps; i++) { 
            if (direction > 0) { 
                playlist.appendChild(playlist.firstElementChild);  
                let el = coverEls.shift(); el.className = 'cover-item pos-spawn-right'; void el.offsetHeight; coverEls.push(el); 
            } else { 
                playlist.insertBefore(playlist.lastElementChild, playlist.firstElementChild);  
                let el = coverEls.pop(); el.className = 'cover-item pos-spawn-left'; void el.offsetHeight; coverEls.unshift(el); 
            } 
        } 
        refreshCovers(); 
        setTimeout(() => { isAnimating = false; }, 50); 
    }, 500); 
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

// Drag & Click Logic
player.onmousedown = (e) => { 
    if (e.target.closest('#controls') || e.target.type === 'range' || e.target.closest('button')) return; 
    unlocked = true; dragged = false; dragMode = null; 
    startX = lastX = e.clientX; startY = lastY = e.clientY; 
    const rect = player.getBoundingClientRect(); 
    offX = e.clientX - rect.left; offY = e.clientY - rect.top; 
}; 

document.onmousemove = (e) => { 
    if (!unlocked) return; 
    const deltaX = e.clientX - startX; 
    const deltaY = e.clientY - startY; 
    
    if (!dragMode && (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4)) { 
        if (e.target.closest('li.active')) dragMode = (Math.abs(deltaY) > Math.abs(deltaX)) ? 'scroll' : 'scrub'; 
        else if (e.target.closest('#playlist-container')) dragMode = (Math.abs(deltaY) > Math.abs(deltaX)) ? 'scroll' : 'move'; 
        else dragMode = 'move'; 
    } 
    
    if (dragMode === 'move') { 
        dragged = true; 
        player.style.left = (e.clientX - offX) + 'px'; 
        player.style.top = (e.clientY - offY) + 'px'; 
    } else if (dragMode === 'scroll') { 
        dragged = true; 
        if (Math.abs(e.clientY - lastY) >= PX_PER_SONG) { 
            performJump(e.clientY > lastY ? -1 : 1); 
            lastY = e.clientY; 
        } 
    } else if (dragMode === 'scrub') { 
        dragged = true; 
        scrub(e); 
    } 
}; 

document.onmouseup = (e) => { 
    if (dragged && dragMode === 'move') { 
        localStorage.setItem('aimp_player_left', player.style.left); 
        localStorage.setItem('aimp_player_top', player.style.top); 
    } 
    
    if (!dragged && unlocked) { 
        const li = e.target.closest('li'), cover = e.target.closest('.cover-item'); 
        
        if (li) {
            const idx = Array.from(playlist.children).indexOf(li);
            // Click active song to seek (scrub) / Click others to jump
            if (idx === SLOT_INDEX) {
                scrub(e);
            } else {
                performJump(idx - SLOT_INDEX);
            }
        } else if (cover) { 
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
        pct = Math.max(0, Math.min(1, pct)); 
        audio.currentTime = pct * audio.duration; 
    } 
} 

function runTickerLoop() { 
    // 1. Move Active Song Forward
    const activeLi = playlist.querySelector('li.active');
    if (activeLi && !audio.paused) {
        const url = activeLi.getAttribute('data-id');
        const inner = activeLi.querySelector('.scroll-inner');
        
        if (inner) {
            if (tickerState[url] === undefined) tickerState[url] = -50;
            tickerState[url] += (0.05 * audio.playbackRate);
            if (tickerState[url] >= 0) tickerState[url] = -50;
            inner.style.transform = `translateX(${tickerState[url]}%)`;
        }
    }

    // 2. Glide Others Backwards
    Object.keys(tickerState).forEach(url => {
        const isCurrentlyPlaying = (url === currentPlayingUrl && !audio.paused);
        if (!isCurrentlyPlaying && tickerState[url] > -50) {
            tickerState[url] -= 0.15; 
            if (tickerState[url] < -50) tickerState[url] = -50;
            const li = playlist.querySelector(`li[data-id="${url}"]`);
            if (li) {
                const inner = li.querySelector('.scroll-inner');
                if (inner) inner.style.transform = `translateX(${tickerState[url]}%)`;
            }
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

const init = () => { 
    coverEls = Array.from(stage.querySelectorAll('.cover-item')); 
    const savedLeft = localStorage.getItem('aimp_player_left'), savedTop = localStorage.getItem('aimp_player_top'); 
    if (savedLeft && savedTop) { player.style.left = savedLeft; player.style.top = savedTop; } 
    
    audio.volume = localStorage.getItem('aimp_vol') || 0.143; 
    volSlider.value = audio.volume; 
    speedSlider.value = localStorage.getItem('aimp_speed') || 1.0; 
    audio.playbackRate = parseFloat(speedSlider.value); 

    const lastTrackUrl = localStorage.getItem('aimp_last_track'); 
    if (lastTrackUrl) { 
        const items = Array.from(playlist.children), idx = items.findIndex(li => li.getAttribute('data-id') === lastTrackUrl); 
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
        activeItem.classList.add('active');
        currentPlayingUrl = activeItem.getAttribute('data-id'); 
        audio.src = encodeURI(currentPlayingUrl); 
    } 
    
    updateUI(); 
    refreshCovers(); 
    runTickerLoop(); 
    Array.from(playlist.children).forEach(li => scanTrack(li));
}; 

document.addEventListener('DOMContentLoaded', init);