function syncNeoNavigation() {
    const path = window.location.pathname;
    document.querySelectorAll('[data-neo-route]').forEach((link) => {
        const route = link.getAttribute('data-neo-route');
        const active = route === '/' ? path === '/' : path.startsWith(route);
        link.classList.toggle('active', active && !link.hasAttribute('data-neo-playlists'));
    });
}

function syncNeoThemeDetails() {
    const root = document.documentElement;
    /* A few visualizer paths use Monochrome's original light/dark attribute
       directly, so keep that compatibility signal aligned with NEO too. */
    root.dataset.theme = root.dataset.neoTheme === 'frost' ? 'white' : 'monochrome';
    const accent = getComputedStyle(root).getPropertyValue('--desktop-accent').trim();
    const channels = colorChannels(accent);
    if (channels) root.style.setProperty('--highlight-rgb', channels, 'important');
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
        'content',
        getComputedStyle(root).getPropertyValue('--desktop-bg').trim() || '#0a0c0f'
    );
}

function colorChannels(color) {
    const hex = color.match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
    if (hex) {
        const value = hex.length === 3 ? [...hex].map((part) => part + part).join('') : hex;
        return [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16)).join(', ');
    }
    const rgb = color.match(/^rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/i);
    return rgb ? `${rgb[1]}, ${rgb[2]}, ${rgb[3]}` : '';
}

function watchNeoMusicNotifications() {
    const recent = new Map();
    const inspect = (task) => {
        if (!task?.matches?.('.download-task') || task.dataset.trackId) return;
        const message = task.querySelector('.notification-message')?.textContent?.trim().replace(/\s+/g, ' ');
        if (!message) return;
        const now = Date.now();
        const previous = recent.get(message);
        if (previous && now - previous.time < 1800 && previous.node.isConnected) {
            task.remove();
            return;
        }
        recent.set(message, { node: task, time: now });
        window.setTimeout(() => {
            if (recent.get(message)?.node === task) recent.delete(message);
        }, 2000);
    };
    new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => {
        inspect(node);
        node.querySelectorAll?.('.download-task').forEach(inspect);
    }))).observe(document.body, { childList: true, subtree: true });
}

if (/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) {
    const musicScope = new URL('./', document.baseURI).href;
    navigator.serviceWorker?.getRegistrations().then((registrations) => {
        registrations
            .filter((registration) => registration.scope.startsWith(musicScope))
            .forEach((registration) => registration.unregister());
    });
    window.caches?.keys().then((keys) => {
        keys
            .filter((key) => /(?:monochrome|neo[-_ ]?music|music-v2)/i.test(key))
            .forEach((key) => window.caches.delete(key));
    });
}

document.addEventListener('DOMContentLoaded', () => {
    syncNeoNavigation();
    syncNeoThemeDetails();
    watchNeoMusicNotifications();
    const searchForm = document.getElementById('search-form');
    const searchInput = document.getElementById('search-input');
    let runtimeReady = false;
    let pendingSearch = '';
    let fastSearchTimer = 0;

    /* Monochrome's bundled type-to-search delay is three seconds. Start a
       settled query quickly and keep that old listener from scheduling a
       second, late navigation for the same text. */
    searchInput?.addEventListener('input', (event) => {
        const query = searchInput.value.trim();
        window.clearTimeout(fastSearchTimer);
        fastSearchTimer = 0;
        if (!query || /(?:monochrome\.tf|monochrome\.samidy\.com|tidal\.com)\//i.test(query)) return;

        event.stopImmediatePropagation();
        fastSearchTimer = window.setTimeout(() => {
            fastSearchTimer = 0;
            if (query !== searchInput.value.trim()) return;
            searchForm?.requestSubmit();
        }, 220);
    }, true);

    /* The upstream app finishes several async setup steps after DOMContentLoaded.
       Queue an early search instead of silently dropping Enter before its own
       submit handler exists. */
    searchForm?.addEventListener('submit', (event) => {
        window.clearTimeout(fastSearchTimer);
        fastSearchTimer = 0;
        if (runtimeReady) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        pendingSearch = searchInput?.value.trim() || '';
    }, true);

    const announceReady = () => {
        if (runtimeReady) return;
        runtimeReady = true;
        document.documentElement.dataset.neoMusicReady = 'true';
        if (window.parent !== window) {
            const targetOrigin = window.location.origin === 'null' ? '*' : window.location.origin;
            window.parent.postMessage({ neoMusicUiReady: true }, targetOrigin);
        }
        if (pendingSearch && searchInput && searchForm) {
            searchInput.value = pendingSearch;
            pendingSearch = '';
            requestAnimationFrame(() => searchForm.requestSubmit());
        }
    };

    const waitForRuntime = window.setInterval(() => {
        /* The current player owns #audio-player. An older integration waited
           for the removed #audio-player-crossfade element, so the desktop
           reported a false startup failure after ten seconds. */
        const player = document.getElementById('audio-player') || document.getElementById('audio-player-crossfade');
        if (!player || !searchForm || !searchInput) return;
        window.clearInterval(waitForRuntime);
        requestAnimationFrame(announceReady);
    }, 120);
    window.setTimeout(() => window.clearInterval(waitForRuntime), 15000);
});
window.addEventListener('popstate', syncNeoNavigation);
window.addEventListener('neo-theme-change', syncNeoThemeDetails);
document.addEventListener('click', () => requestAnimationFrame(syncNeoNavigation));

document.addEventListener(
    'contextmenu',
    (event) => {
        if (
            event.target.closest(
                '.track-item, .queue-track-item, .card, .now-playing-bar .cover, .now-playing-bar .title, .now-playing-bar .album, .now-playing-bar .artist'
            )
        ) {
            event.preventDefault();
        }
    },
    true
);
