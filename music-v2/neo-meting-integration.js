(function () {
  "use strict";

  if (window.__NEO_METING_INTEGRATION__) return;
  window.__NEO_METING_INTEGRATION__ = true;
  window.__NEO_MUSIC__ = true;

  // This CORS-enabled NEO relay keeps the working DrFrost catalog and audio
  // backend reachable from local previews and immutable CDN builds.
  var DEFAULT_SERVER_ORIGIN = "https://neo-stratus-api-w6nw.onrender.com";
  var configuredOrigin = String(window.__NEO_MUSIC_SERVER_ORIGIN__ || DEFAULT_SERVER_ORIGIN).trim();
  var serverOrigin = configuredOrigin.replace(/\/+$/, "");

  window.__NEO_MUSIC_SERVER_ORIGIN__ = serverOrigin;
  window.__NEO_MUSIC_API__ = Object.freeze({
    base: serverOrigin,
    searchUrl: function (query) {
      return serverOrigin + "/music/v1/search?q=" + encodeURIComponent(query || "");
    },
    homeUrl: function () {
      return serverOrigin + "/music/v1/home";
    },
    trackUrl: function (id) {
      return serverOrigin + "/music/v1/audio/" + encodeURIComponent(id || "");
    }
  });

  // Keep every Music network request on the shared NEO resource route when
  // the app is hosted inside the desktop. Optional lyrics providers are muted
  // in a standalone preview because they commonly reject browser CORS and
  // must never break otherwise-working search or playback.
  var nativeFetch = window.fetch.bind(window);
  var optionalLyricsHosts = /(?:lyrics|translate)/i;
  window.fetch = function (input, options) {
    var raw = typeof input === "string" || input instanceof URL ? String(input) : input && input.url;
    var target;
    try { target = new URL(raw || "", document.baseURI); }
    catch (error) { return nativeFetch(input, options); }
    if (target.origin === location.origin || !/^https?:$/.test(target.protocol)) return nativeFetch(input, options);
    if (window.parent === window && optionalLyricsHosts.test(target.hostname)) {
      return Promise.resolve(new Response('{"results":[]}', {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }));
    }
    if (window.NEO_PROXY_CLIENT && typeof window.NEO_PROXY_CLIENT.resolve === "function") {
      return window.NEO_PROXY_CLIENT.resolve(target.href, "fetch", options && options.signal).then(function (route) {
        return nativeFetch(route, options);
      });
    }
    return nativeFetch(input, options);
  };
})();
