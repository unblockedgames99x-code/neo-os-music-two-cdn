lucide.createIcons();

const API_BASE='';
const cardGrid=document.getElementById('cardGrid');
const searchInput=document.getElementById('searchInput');

const npBar=document.getElementById('npBar');
const npTitle=document.getElementById('npTitle');
const npPlayBtn=document.getElementById('npPlayBtn');
const npProgressFill=document.getElementById('npProgressFill');
const npThumb=document.getElementById('npThumb');
const npmView=document.getElementById('npmView');
const npmCover=document.getElementById('npmCover');
const npmTrackTitle=document.getElementById('npmTrackTitle');
const npmTrackArtist=document.getElementById('npmTrackArtist');
const npmProgressFill=document.getElementById('npmProgressFill');
const npmProgressHandle=document.getElementById('npmProgressHandle');
const npmProgressTrack=document.getElementById('npmProgressTrack');
const npmDuration=document.getElementById('npmDuration');
const npmCurrentTime=document.getElementById('npmCurrentTime');
const npmPlayBtn=document.getElementById('npmPlayBtn');
const npmBackTenBtn=document.getElementById('npmBackTenBtn');
const npmFwdTenBtn=document.getElementById('npmFwdTenBtn');
const contentArea=document.getElementById('contentArea');
const amLyricsEl=document.getElementById('amLyricsEl');
const sbFavourites=document.getElementById('sbFavourites');
const sbFavHeader=document.getElementById('sbFavHeader');
const npmFavBtn=document.getElementById('npmFavBtn');
let isSeeking=false;

let currentEventSource=null;
let debounceTimer=null;
let audioEl=null;
let currentPlayingId=null;
let currentTrack=null;

function escapeHtml(str) {
    const div=document.createElement('div');
    div.textContent=str??'';
    return div.innerHTML;
}

function renderCard(track) {
    const card=document.createElement('div');
    card.className='music-card';
    card.dataset.id=track.id;
    card.innerHTML=`
    <div class="card-art">
        <img src="${track.thumb}" alt="${escapeHtml(track.title)}" loading="lazy">
        <button class="card-fav-btn${isFavourite(track.id)?' faved':''}" data-id="${track.id}">
            <i data-lucide="heart"></i>
        </button>
        <div class="card-play">
            <i data-lucide="play"></i>
        </div>
    </div>
    <div class="card-title" title="${escapeHtml(track.title)} - ${escapeHtml(track.artist)}">
        ${escapeHtml(track.title)}
    </div>`;
    card.querySelector('.card-play').addEventListener('click',(e)=>{
        e.stopPropagation();
        playTrack(track);
    });
    card.addEventListener('click',()=>playTrack(track));
    return card;
}

function searchVinyl(query) {
    if (currentEventSource) {
        currentEventSource.close();
        currentEventSource=null;
    }
    if (!query.trim()) {
        fetchHome();
        return;
    }
    cardGrid.className='card-grid';
    cardGrid.innerHTML='';
    const url=`${API_BASE}/api/music/ytm/search?q=${encodeURIComponent(query)}&limit=20`;
    const es=new EventSource(url);
    currentEventSource=es;
    es.onmessage=(event)=>{
        if (event.data==='[DONE]') {
            es.close();
            currentEventSource=null;
            return;
        }
        try {
            const track=JSON.parse(event.data);
            cardGrid.appendChild(renderCard(track));
            lucide.createIcons();
        } catch (err) {
            console.error('failed to parse track',err,event.data);
        }
    };
    es.onerror=()=>{
        es.close();
        currentEventSource=null;
    };
}

searchInput.addEventListener('input',(e)=>{
    clearTimeout(debounceTimer);
    const q=e.target.value;
    debounceTimer=setTimeout(()=>searchVinyl(q),350);
});

function renderSection(title,tracks) {
    const section=document.createElement('div');
    section.className='home-section';
    section.innerHTML=`<h2 class="section-title">${escapeHtml(title)}</h2>`;
    const grid=document.createElement('div');
    grid.className='card-grid';
    tracks.forEach(track=>grid.appendChild(renderCard(track)));
    section.appendChild(grid);
    return section;
}

function fetchHome() {
    if (currentEventSource) {
        currentEventSource.close();
        currentEventSource=null;
    }
    cardGrid.innerHTML='';
    cardGrid.className='home-sections';
    const url=`${API_BASE}/api/music/ytm/home?limit=10`;
    const es=new EventSource(url);
    currentEventSource=es;
    es.onmessage=(event)=>{
        if (event.data==='[DONE]') {
            es.close();
            currentEventSource=null;
            return;
        }
        try {
            const {section,tracks}=JSON.parse(event.data);
            cardGrid.appendChild(renderSection(section,tracks));
            lucide.createIcons();
        } catch (err) {
            console.error('failed to parse home section',err,event.data);
        }
    };
    es.onerror=()=>{
        es.close();
        currentEventSource=null;
    };
}

function playTrack(track) {
    if (currentTrack&&String(currentTrack.id)===String(track.id)&&audioEl) {
        if (audioEl.paused) audioEl.play();
        showNPView();
        return;
    }
    const url=`${API_BASE}/api/sp/audio/${track.id}`;
    if (!audioEl) {
        audioEl=new Audio();
        document.body.appendChild(audioEl);
        audioEl.addEventListener('timeupdate',updProgress);
        audioEl.addEventListener('play',()=>setPlayButtonState(true));
        audioEl.addEventListener('pause',()=>setPlayButtonState(false));
        audioEl.addEventListener('ended',()=>setPlayButtonState(false));
    }
    audioEl.pause();
    audioEl.src=url;
    audioEl.play().catch((err)=>console.error('playback failed',err));
    currentTrack=track;
    currentPlayingId=track.id;
    npTitle.textContent=track.title;
    npThumb.src=track.thumb;
    npThumb.style.display='block';
    npmProgressFill.style.width='0%';
    npBar.classList.add('visible');
    npmCover.src=track.thumb;
    npmTrackTitle.textContent=track.title;
    npmTrackArtist.textContent=track.artist;
    npmProgressFill.style.width='0%';
    npmProgressHandle.style.left='0%';
    npmCurrentTime.textContent='0:00';
    npmFavBtn.classList.toggle('faved',isFavourite(track.id));
    amLyricsEl.songTitle=track.title;
    amLyricsEl.songArtist=track.artist;
    amLyricsEl.query=`${track.title} ${track.artist}`;
    if (track.duration) amLyricsEl.songDurationMs=track.duration*1000;
    amLyricsEl.currentTime=0;
    npmDuration.textContent=track.duration?formatTime(track.duration):'0:00';
    showNPView();
    document.querySelectorAll('.music-card.playing').forEach((el)=>el.classList.remove('playing'));
    const el=document.querySelector(`.music-card[data-id="${track.id}"]`);
    if (el) el.classList.add('playing');
}

function updProgress() {
    if (!currentTrack||!currentTrack.duration) return;
    const pct=Math.min(100,(audioEl.currentTime/currentTrack.duration)*100);
    npmProgressFill.style.width=`${pct}%`;
    npProgressFill.style.width=`${pct}%`;
    npmProgressHandle.style.left=`${pct}%`;
    npmCurrentTime.textContent=formatTime(audioEl.currentTime);
    amLyricsEl.currentTime=audioEl.currentTime*1000;
}

function setPlayButtonState(isPlaying) {
    const iconName=isPlaying?'pause':'play';
    npPlayBtn.innerHTML=`<i data-lucide="${iconName}"></i>`;
    npmPlayBtn.innerHTML=`<i data-lucide="${iconName}"></i>`;
    lucide.createIcons();
}

npPlayBtn.addEventListener('click',()=>{
    if (!audioEl||!currentTrack) return;
    if (audioEl.paused) audioEl.play();
    else audioEl.pause();
});

npmPlayBtn.addEventListener('click',()=>{
    if (!audioEl||!currentTrack) return;
    if (audioEl.paused) audioEl.play();
    else audioEl.pause();
});

npmBackTenBtn.addEventListener('click',()=>{
    if (!audioEl) return;
    audioEl.currentTime=Math.max(0,audioEl.currentTime-10);
    amLyricsEl.currentTime=audioEl.currentTime*1000;
});

npmFwdTenBtn.addEventListener('click',()=>{
    if (!audioEl||!currentTrack?.duration) return;
    audioEl.currentTime=Math.min(currentTrack.duration,audioEl.currentTime+10);
    amLyricsEl.currentTime=audioEl.currentTime*1000;
});

npmFavBtn.addEventListener('click',()=>{
    if (!currentTrack) return;
    toggleFavourite(currentTrack);
});

function formatTime(seconds) {
    if (!isFinite(seconds)||seconds<0) return '0:00';
    const m=Math.floor(seconds/60);
    const s=Math.floor(seconds%60);
    return `${m}:${s.toString().padStart(2,'0')}`;
}

function seekToPE(e) {
    if (!currentTrack?.duration) return;
    const rect=npmProgressTrack.getBoundingClientRect();
    const x=Math.min(Math.max(e.clientX-rect.left,0),rect.width);
    const pct=x/rect.width;
    const time=pct*currentTrack.duration;
    npmProgressFill.style.width=`${pct*100}%`;
    npProgressFill.style.width=`${pct*100}%`;
    npmProgressHandle.style.left=`${pct*100}%`;
    npmCurrentTime.textContent=formatTime(time);
    if (audioEl) audioEl.currentTime=time;
    amLyricsEl.currentTime=time*1000;
}

npmProgressTrack.addEventListener('mousedown',(e)=>{
    isSeeking=true;
    seekToPE(e);
    const onMove=(ev)=>seekToPE(ev);
    const onUp=()=>{
        isSeeking=false;
        document.removeEventListener('mousemove',onMove);
        document.removeEventListener('mouseup',onUp);
    };
    document.addEventListener('mousemove',onMove);
    document.addEventListener('mouseup',onUp);
});

amLyricsEl.addEventListener('line-click',(e)=>{
    if (!audioEl) return;
    audioEl.currentTime=e.detail.timestamp/1000;
    audioEl.play();
});

function showNPView() {
    contentArea.style.display='none';
    npmView.classList.add('visible');
}

function hideNPView() {
    npmView.classList.remove('visible');
    contentArea.style.display='';
}

document.querySelectorAll('.sb-item[data-view]').forEach(item=>{
    item.addEventListener('click',()=>{
        document.querySelectorAll('.sb-item[data-view]').forEach(el=>el.classList.remove('active'));;
        item.classList.add('active');
        hideNPView();
        const view=item.dataset.view;
        if (view==='home') fetchHome();
        else if (view==='library') fetchLibrary();
    });
});

const FAV_KEY='favourites';

function getFavourites() {
    let favs;
    try {
        favs=JSON.parse(localStorage.getItem(FAV_KEY)||'[]');
    } catch (err) {
        favs=[];
    }
    const seen=new Set();
    const deduped=[];
    for (const t of favs) {
        const id=String(t.id);
        if (!seen.has(id)) {
            seen.add(id);
            deduped.push(t);
        }
    }
    if (deduped.length!==favs.length) saveFavourites(deduped);
    return deduped;
}

function saveFavourites(favs) {
    localStorage.setItem(FAV_KEY,JSON.stringify(favs));
}

function isFavourite(id) {
    const idStr=String(id);
    return getFavourites().some(t=>String(t.id)===idStr);
}

function toggleFavourite(track) {
    let favs=getFavourites();
    const idx=favs.findIndex(t=>String(t.id)===String(track.id));
    if (idx>-1) {
        favs.splice(idx,1);
    } else {
        favs.push(track);
    }
    saveFavourites(favs);
    renderSBFavourites();
    document.querySelectorAll(`.card-fav-btn[data-id="${track.id}"]`).forEach(el=>{
        el.classList.toggle('faved',isFavourite(track.id));
    });
    if (currentTrack&&String(currentTrack.id)===String(track.id)) {
        npmFavBtn.classList.toggle('faved',isFavourite(track.id));
    }
    if (document.querySelector('.sb-item.active')?.dataset.view==='library') {
        fetchLibrary();
    }
}

function renderSBFavourites() {
    const favs=getFavourites();
    sbFavourites.innerHTML='';
    favs.forEach(track=>{
        const item=document.createElement('div');
        item.className='sb-fav-item';
        item.innerHTML=`
        <img src="${track.thumb}" alt="">
        <span>${escapeHtml(track.title)}</span>`;
        item.addEventListener('click',()=>playTrack(track));
        sbFavourites.appendChild(item);
    });
}

sbFavHeader.addEventListener('click',()=>{
    sbFavHeader.classList.toggle('collapsed');
    sbFavourites.classList.toggle('collapsed');
});

function fetchLibrary() {
    if (currentEventSource) {
        currentEventSource.close();
        currentEventSource=null;
    }
    cardGrid.className='card-grid';
    cardGrid.innerHTML='';
    getFavourites().forEach(track=>cardGrid.appendChild(renderCard(track)));
    lucide.createIcons();
}

fetchHome();
renderSBFavourites();
