lucide.createIcons();

const API_BASE=String(window.__NEO_MUSIC_SERVER_ORIGIN__||'').replace(/\/+$/,'');
const FALLBACK_COVER='./assets/cover-fallback.svg';
const FALLBACK_COVER_URL=new URL(FALLBACK_COVER,document.baseURI).href;
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

function coverUrl(value) {
    const cover=String(value||'').trim();
    if (!cover) return FALLBACK_COVER_URL;
    try {
        const parsed=new URL(cover,document.baseURI);
        return ['http:','https:','data:','blob:'].includes(parsed.protocol)?parsed.href:FALLBACK_COVER_URL;
    } catch (err) {
        return FALLBACK_COVER_URL;
    }
}

function applyCoverFallback(image,value) {
    if (!image) return;
    const cover=coverUrl(value);
    image.decoding='async';
    image.referrerPolicy=/^(?:data|blob):/.test(cover)?'':'no-referrer';
    image.classList.toggle('is-fallback-cover',cover===FALLBACK_COVER_URL);
    image.onerror=()=>{
        image.onerror=null;
        image.classList.add('is-fallback-cover');
        image.src=FALLBACK_COVER_URL;
    };
    if (/^https?:/i.test(cover)&&window.NEO_PROXY_CLIENT) {
        image.src=FALLBACK_COVER_URL;
        window.NEO_PROXY_CLIENT.image(cover).then((route)=>{if(image.isConnected) image.src=route;}).catch(()=>{});
    } else image.src=cover;
}

window.NEO_MUSIC_COVERS=Object.freeze({fallback:FALLBACK_COVER,url:coverUrl,set:applyCoverFallback});

function openMusicEventStream(url) {
    const controller=new AbortController();
    const stream={onmessage:null,onerror:null,closed:false,close(){this.closed=true;controller.abort();}};
    let watchdog=0;
    const fail=(error)=>{if(stream.closed||controller.signal.aborted)return;stream.closed=true;controller.abort();if(typeof stream.onerror==='function')stream.onerror(error);};
    const arm=()=>{clearTimeout(watchdog);watchdog=setTimeout(()=>fail(new Error('Music server timed out.')),12000);};
    Promise.resolve().then(async()=>{
        let route=url;
        if(window.NEO_PROXY_CLIENT) route=await window.NEO_PROXY_CLIENT.resolve(url,'music-catalog');
        arm();
        const response=await fetch(route,{signal:controller.signal,cache:'no-store',credentials:'omit',headers:{Accept:'text/event-stream'}});
        if(!response.ok||!response.body) throw new Error(`Music server returned ${response.status}.`);
        const reader=response.body.getReader();
        const decoder=new TextDecoder();
        let buffer='';
        while(!stream.closed){
            const chunk=await reader.read();
            if(chunk.done)break;
            arm();
            buffer+=decoder.decode(chunk.value,{stream:true});
            const lines=buffer.split(/\r?\n/);
            buffer=lines.pop()||'';
            lines.forEach((line)=>{
                if(!line.startsWith('data:'))return;
                const data=line.slice(5).trimStart();
                if(typeof stream.onmessage==='function')stream.onmessage({data});
            });
        }
        if(buffer.startsWith('data:')&&typeof stream.onmessage==='function')stream.onmessage({data:buffer.slice(5).trimStart()});
        clearTimeout(watchdog);
        if(!stream.closed&&typeof stream.onmessage==='function')stream.onmessage({data:'[DONE]'});
    }).catch((error)=>{clearTimeout(watchdog);if(error?.name!=='AbortError')fail(error);});
    return stream;
}

function showCatalogStatus(title,detail,retry,label='Try again') {
    cardGrid.innerHTML='';
    const status=document.createElement('div');
    status.className='catalog-status';
    const icon=document.createElement('i');
    icon.setAttribute('data-lucide','music-2');
    const heading=document.createElement('strong');
    heading.textContent=title;
    const copy=document.createElement('span');
    copy.textContent=detail;
    status.append(icon,heading,copy);
    if (typeof retry==='function') {
        const button=document.createElement('button');
        button.type='button';
        button.textContent=label;
        button.addEventListener('click',retry);
        status.appendChild(button);
    }
    cardGrid.appendChild(status);
    lucide.createIcons();
}

function clearCatalogStatus() {
    cardGrid.querySelector('.catalog-status')?.remove();
}

function hasCatalogResults() {
    return Boolean(cardGrid.querySelector('.music-card,.home-section'));
}

function renderCard(track) {
    const card=document.createElement('div');
    card.className='music-card';
    card.dataset.id=track.id;
    card.innerHTML=`
    <div class="card-art">
        <img src="${escapeHtml(FALLBACK_COVER_URL)}" alt="${escapeHtml(track.title)}" loading="lazy" decoding="async">
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
    applyCoverFallback(card.querySelector('.card-art img'),track.thumb);
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
    showCatalogStatus('Searching music…','Connecting to the music service.');
    const url=`${API_BASE}/music/v1/search?q=${encodeURIComponent(query)}&limit=20`;
    const es=openMusicEventStream(url);
    currentEventSource=es;
    es.onmessage=(event)=>{
        if (event.data==='[DONE]') {
            es.close();
            currentEventSource=null;
            if (!hasCatalogResults()) showCatalogStatus('No songs found','Try a different song, artist, or album.',()=>searchVinyl(query),'Search again');
            return;
        }
        try {
            const track=JSON.parse(event.data);
            clearCatalogStatus();
            cardGrid.appendChild(renderCard(track));
            lucide.createIcons();
        } catch (err) {
            console.error('failed to parse track',err,event.data);
        }
    };
    es.onerror=()=>{
        es.close();
        currentEventSource=null;
        if (!hasCatalogResults()) showCatalogStatus('Music server unavailable','The music service did not answer. Check your connection, then try again.',()=>searchVinyl(query));
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
    cardGrid.className='home-sections';
    showCatalogStatus('Loading music…','Connecting to the music service.');
    const url=`${API_BASE}/music/v1/home?limit=10`;
    const es=openMusicEventStream(url);
    currentEventSource=es;
    es.onmessage=(event)=>{
        if (event.data==='[DONE]') {
            es.close();
            currentEventSource=null;
            if (!hasCatalogResults()) showCatalogStatus('Music server unavailable','DrFrost did not return any music.',fetchHome);
            return;
        }
        try {
            const {section,tracks}=JSON.parse(event.data);
            clearCatalogStatus();
            cardGrid.appendChild(renderSection(section,tracks));
            lucide.createIcons();
        } catch (err) {
            console.error('failed to parse home section',err,event.data);
        }
    };
    es.onerror=()=>{
        es.close();
        currentEventSource=null;
        if (!hasCatalogResults()) showCatalogStatus('Music server unavailable','The music service did not answer. Check your connection, then try again.',fetchHome);
    };
}

function playTrack(track) {
    if (currentTrack&&String(currentTrack.id)===String(track.id)&&audioEl) {
        if (audioEl.paused) audioEl.play();
        showNPView();
        return;
    }
    const url=`${API_BASE}/music/v1/audio/${encodeURIComponent(track.id)}`;
    if (!audioEl) {
        audioEl=new Audio();
        audioEl.crossOrigin='anonymous';
        document.body.appendChild(audioEl);
        audioEl.addEventListener('timeupdate',updProgress);
        audioEl.addEventListener('play',()=>setPlayButtonState(true));
        audioEl.addEventListener('pause',()=>setPlayButtonState(false));
        audioEl.addEventListener('ended',()=>setPlayButtonState(false));
    }
    audioEl.pause();
    currentTrack=track;
    currentPlayingId=track.id;
    npTitle.textContent=track.title;
    applyCoverFallback(npThumb,track.thumb);
    npThumb.style.display='block';
    npmProgressFill.style.width='0%';
    npBar.classList.add('visible');
    applyCoverFallback(npmCover,track.thumb);
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
    const playback=window.__NEO_MUSIC_PLAYBACK__;
    if (playback&&typeof playback.play==='function') {
        playback.play(audioEl,track).catch((err)=>{
            if (err?.name==='AbortError') return;
            console.error('playback failed',err);
            npmTrackArtist.textContent='Playback unavailable — choose another track';
            setPlayButtonState(false);
        });
    } else if (window.NEO_PROXY_CLIENT) {
        const requestedId=String(track.id);
        npmTrackArtist.textContent='Connecting through NEO proxy…';
        window.NEO_PROXY_CLIENT.media(url).then((route)=>{
            if(!currentTrack||String(currentTrack.id)!==requestedId)return;
            audioEl.src=route;
            npmTrackArtist.textContent=track.artist;
            audioEl.play().catch((err)=>console.error('playback failed',err));
        }).catch((err)=>{
            console.error('playback proxy failed',err);
            npmTrackArtist.textContent='Playback unavailable — choose another track';
            setPlayButtonState(false);
        });
    } else {
        audioEl.src=url;
        audioEl.play().catch((err)=>console.error('playback failed',err));
    }
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
        <img src="${escapeHtml(FALLBACK_COVER_URL)}" alt="" loading="lazy" decoding="async">
        <span>${escapeHtml(track.title)}</span>`;
        applyCoverFallback(item.querySelector('img'),track.thumb);
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
