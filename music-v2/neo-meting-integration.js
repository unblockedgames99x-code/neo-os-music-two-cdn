(function () {
  "use strict";

  if (window.__NEO_METING_INTEGRATION__) return;
  window.__NEO_METING_INTEGRATION__ = true;
  window.__NEO_MUSIC__ = true;

  // NEO Music uses the same server-side catalog and audio routes as the
  // known-good music build. Keep the origin overridable for local QA.
  var DEFAULT_SERVER_ORIGIN = "https://taco-chat-static-blend.c21burroughs.chatgpt.site";
  var configuredOrigin = String(window.__NEO_MUSIC_SERVER_ORIGIN__ || DEFAULT_SERVER_ORIGIN).trim();
  var serverOrigin = configuredOrigin.replace(/\/+$/, "");

  window.__NEO_MUSIC_SERVER_ORIGIN__ = serverOrigin;
  window.__NEO_MUSIC_API__ = Object.freeze({
    base: serverOrigin,
    searchUrl: function (query) {
      return serverOrigin + "/api/music/ytm/search?q=" + encodeURIComponent(query || "");
    },
    homeUrl: function () {
      return serverOrigin + "/api/music/ytm/home";
    },
    trackUrl: function (id) {
      return serverOrigin + "/api/sp/audio/" + encodeURIComponent(id || "");
    }
  });
})();
