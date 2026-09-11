(function () {
  "use strict";

  if (window.__NEO_METING_INTEGRATION__) return;
  window.__NEO_METING_INTEGRATION__ = true;
  window.__NEO_MUSIC__ = true;

  var API_BASE = "https://neo-stratus-api-w6nw.onrender.com/music/v1";
  var AUDIUS_BASES = ["https://api.audius.co/v1", "https://discoveryprovider.audius.co/v1"];
  var AUDIUS_APP_NAME = "NEO Music";
  var nativeEventSource = window.EventSource;
  var mediaSource = Object.getOwnPropertyDescriptor(window.HTMLMediaElement.prototype, "src");
  var audiusStreams = new Map();

  function parseUrl(value) {
    try { return new URL(String(value || ""), document.baseURI); } catch (error) { return null; }
  }

  function catalogUrl(value) {
    var url = parseUrl(value);
    if (!url) return value;
    if (url.pathname === "/api/music/ytm/search") {
      return API_BASE + "/search" + url.search;
    }
    if (url.pathname === "/api/music/ytm/home") {
      return API_BASE + "/home" + url.search;
    }
    return value;
  }

  function catalogRequest(value) {
    var url = parseUrl(value);
    if (!url) return null;
    var mode = url.pathname === "/api/music/ytm/search" ? "search" :
      url.pathname === "/api/music/ytm/home" ? "home" : "";
    if (!mode) return null;
    return {
      mode: mode,
      query: String(url.searchParams.get("q") || "").trim(),
      limit: Math.min(30, Math.max(1, Number(url.searchParams.get("limit")) || (mode === "search" ? 20 : 10)))
    };
  }

  function audiusStreamUrl(trackId) {
    return AUDIUS_BASES[0] + "/tracks/" + encodeURIComponent(trackId) +
      "/stream?app_name=" + encodeURIComponent(AUDIUS_APP_NAME);
  }

  function uniqueStrings(values) {
    return values.filter(function (value, index) {
      return value && values.indexOf(value) === index;
    });
  }

  function audiusStreamCandidates(track) {
    var stable = audiusStreamUrl(String(track.id));
    var direct = String(track.stream && track.stream.url || "");
    if (!direct) return [stable];
    var parsed = parseUrl(direct);
    if (!parsed) return [stable];
    var origins = [parsed.origin].concat(Array.isArray(track.stream.mirrors) ? track.stream.mirrors : []);
    var candidates = origins.map(function (origin) {
      try { return new URL(parsed.pathname + parsed.search, String(origin)).href; } catch (error) { return ""; }
    });
    candidates.push(stable);
    return uniqueStrings(candidates).sort(function (left, right) {
      function score(value) {
        try {
          var host = new URL(value).hostname;
          if (/figment\.io$/i.test(host)) return 0;
          if (/audius\.co$/i.test(host)) return 1;
        } catch (error) {}
        return 2;
      }
      return score(left) - score(right);
    });
  }

  function savedAudiusStreams(trackId) {
    if (audiusStreams.has(trackId)) return audiusStreams.get(trackId);
    try {
      var favorites = JSON.parse(localStorage.getItem("favourites") || "[]");
      var saved = Array.isArray(favorites) && favorites.find(function (track) {
        return String(track && track.id || "") === trackId && track.streamUrl;
      });
      if (saved) {
        var candidates = uniqueStrings((Array.isArray(saved.streamCandidates) ? saved.streamCandidates : []).concat(String(saved.streamUrl)));
        audiusStreams.set(trackId, candidates);
        return candidates;
      }
    } catch (error) {}
    return [];
  }

  function audioUrl(value) {
    var url = parseUrl(value);
    if (!url) return value;
    var match = url.pathname.match(/^\/api\/sp\/audio\/([A-Za-z0-9_-]{6,32})$/);
    if (!match) return value;
    var candidates = savedAudiusStreams(match[1]);
    return candidates[0] || API_BASE + "/audio/" + encodeURIComponent(match[1]);
  }

  if (typeof nativeEventSource === "function") {
    function fetchAudius(request, signal, index) {
      var providerIndex = Number(index) || 0;
      if (providerIndex >= AUDIUS_BASES.length) return Promise.reject(new Error("Music catalog is unavailable."));
      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, 8000);
      function cancelled() { controller.abort(); }
      if (signal) signal.addEventListener("abort", cancelled, { once: true });
      var path = request.mode === "search" ? "/tracks/search" : "/tracks/trending";
      var endpoint = new URL(AUDIUS_BASES[providerIndex] + path);
      if (request.mode === "search") endpoint.searchParams.set("query", request.query);
      else endpoint.searchParams.set("time", "week");
      endpoint.searchParams.set("limit", String(request.limit));
      endpoint.searchParams.set("app_name", AUDIUS_APP_NAME);
      return fetch(endpoint.href, { cache: "no-store", credentials: "omit", signal: controller.signal })
        .then(function (response) {
          if (!response.ok) throw new Error("Music fallback returned " + response.status + ".");
          return response.json();
        })
        .then(function (payload) {
          var tracks = Array.isArray(payload && payload.data) ? payload.data : [];
          return tracks.filter(function (track) {
            return track && track.id && track.title && track.is_available !== false &&
              track.is_streamable !== false && !(track.is_stream_gated || track.stream_conditions);
          }).map(function (track) {
            var sourceId = String(track.id);
            var id = "au_" + sourceId;
            var streamUrl = audiusStreamUrl(sourceId);
            var streamCandidates = audiusStreamCandidates(track);
            audiusStreams.set(id, streamCandidates);
            var artwork = track.artwork || {};
            var artist = track.user && (track.user.name || track.user.handle) || "Unknown Artist";
            return {
              id: id,
              title: String(track.title),
              artist: String(artist),
              thumb: String(artwork["480x480"] || artwork["150x150"] || ""),
              duration: Number(track.duration) || 0,
              streamUrl: streamUrl,
              streamCandidates: streamCandidates,
              provider: "audius"
            };
          });
        })
        .finally(function () {
          clearTimeout(timer);
          if (signal) signal.removeEventListener("abort", cancelled);
        })
        .catch(function (error) {
          if (signal && signal.aborted) throw error;
          return fetchAudius(request, signal, providerIndex + 1);
        });
    }

    function NeoMusicEventSource(value, options) {
      var request = catalogRequest(value);
      if (!request) return new nativeEventSource(value, options);

      var bridge = this;
      var listeners = { open: [], message: [], error: [] };
      var fallbackController = new AbortController();
      var fallbackStarted = false;
      var primaryDelivered = false;
      var winner = "";
      var nativeSource = new nativeEventSource(catalogUrl(value), options);
      var fallbackTimer = setTimeout(startFallback, 1200);

      Object.defineProperties(bridge, {
        url: { value: String(value), enumerable: true },
        withCredentials: { value: false, enumerable: true },
        readyState: { value: 0, writable: true, enumerable: true }
      });
      bridge.onopen = null;
      bridge.onmessage = null;
      bridge.onerror = null;

      function emit(type, event) {
        if (bridge.readyState === 2) return;
        var handler = bridge["on" + type];
        if (typeof handler === "function") handler.call(bridge, event);
        listeners[type].slice().forEach(function (listener) { listener.call(bridge, event); });
      }

      function select(source) {
        if (winner) return winner === source;
        winner = source;
        clearTimeout(fallbackTimer);
        bridge.readyState = 1;
        emit("open", { type: "open", target: bridge });
        if (source === "primary") fallbackController.abort();
        else nativeSource.close();
        return true;
      }

      function finishPrimary() {
        if (!winner) { startFallback(); return; }
        if (winner === "primary") emit("message", { type: "message", data: "[DONE]", target: bridge });
      }

      function startFallback() {
        if (fallbackStarted || winner === "primary" || bridge.readyState === 2) return;
        fallbackStarted = true;
        fetchAudius(request, fallbackController.signal, 0).then(function (tracks) {
          if (bridge.readyState === 2 || !tracks.length || !select("fallback")) {
            if (!tracks.length && !winner) throw new Error("No music was found.");
            return;
          }
          if (request.mode === "home") {
            emit("message", {
              type: "message",
              data: JSON.stringify({ section: "Trending now", tracks: tracks }),
              target: bridge
            });
          } else {
            tracks.forEach(function (track) {
              emit("message", { type: "message", data: JSON.stringify(track), target: bridge });
            });
          }
          emit("message", { type: "message", data: "[DONE]", target: bridge });
        }).catch(function () {
          if (!winner && bridge.readyState !== 2) {
            bridge.readyState = 2;
            var event = { type: "error", target: bridge };
            var handler = bridge.onerror;
            if (typeof handler === "function") handler.call(bridge, event);
            listeners.error.slice().forEach(function (listener) { listener.call(bridge, event); });
          }
        });
      }

      nativeSource.onmessage = function (event) {
        if (event.data === "[DONE]" && !primaryDelivered) { nativeSource.close(); startFallback(); return; }
        if (event.data === "[DONE]") { finishPrimary(); return; }
        primaryDelivered = true;
        if (select("primary")) emit("message", { type: "message", data: event.data, target: bridge });
      };
      nativeSource.onerror = function () {
        nativeSource.close();
        if (winner === "primary") finishPrimary();
        else startFallback();
      };

      bridge.addEventListener = function (type, listener) {
        if (listeners[type] && typeof listener === "function") listeners[type].push(listener);
      };
      bridge.removeEventListener = function (type, listener) {
        if (!listeners[type]) return;
        listeners[type] = listeners[type].filter(function (item) { return item !== listener; });
      };
      bridge.close = function () {
        if (bridge.readyState === 2) return;
        bridge.readyState = 2;
        clearTimeout(fallbackTimer);
        nativeSource.close();
        fallbackController.abort();
      };
    }
    NeoMusicEventSource.prototype = { constructor: NeoMusicEventSource };
    Object.setPrototypeOf(NeoMusicEventSource, nativeEventSource);
    Object.defineProperties(NeoMusicEventSource, {
      CONNECTING: { value: 0 },
      OPEN: { value: 1 },
      CLOSED: { value: 2 }
    });
    window.EventSource = NeoMusicEventSource;
  }

  if (mediaSource && mediaSource.get && mediaSource.set && mediaSource.configurable !== false) {
    Object.defineProperty(window.HTMLMediaElement.prototype, "src", {
      configurable: true,
      enumerable: mediaSource.enumerable,
      get: mediaSource.get,
      set: function (value) {
        var next = audioUrl(value);
        if (next !== value && this instanceof window.HTMLAudioElement) {
          this.crossOrigin = "anonymous";
          var parsed = parseUrl(value);
          var match = parsed && parsed.pathname.match(/^\/api\/sp\/audio\/([A-Za-z0-9_-]{6,32})$/);
          var candidates = match ? savedAudiusStreams(match[1]) : [];
          if (this.__neoMusicFallbackState && this.__neoMusicFallbackState.handler) {
            this.removeEventListener("error", this.__neoMusicFallbackState.handler);
          }
          if (candidates.length > 1) {
            var media = this;
            var state = { index: 0, candidates: candidates.slice(), handler: null };
            state.handler = function () {
              if (state.index + 1 >= state.candidates.length) return;
              state.index += 1;
              mediaSource.set.call(media, state.candidates[state.index]);
              try { media.load(); } catch (error) {}
              try {
                var playback = media.play();
                if (playback && typeof playback.catch === "function") playback.catch(function () {});
              } catch (error) {}
            };
            this.__neoMusicFallbackState = state;
            this.addEventListener("error", state.handler);
          } else {
            this.__neoMusicFallbackState = null;
          }
        }
        mediaSource.set.call(this, next);
      }
    });
  }

  window.__NEO_MUSIC_API__ = Object.freeze({
    base: API_BASE,
    fallbackBases: AUDIUS_BASES.slice(),
    catalogUrl: catalogUrl,
    audioUrl: audioUrl
  });
})();
