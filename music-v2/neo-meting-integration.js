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
})();
