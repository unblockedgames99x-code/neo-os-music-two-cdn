(function () {
  "use strict";

  if (window.__NEO_METING_INTEGRATION__) return;
  window.__NEO_METING_INTEGRATION__ = true;
  window.__NEO_MUSIC__ = true;

  var API_BASE = "https://neo-stratus-api-w6nw.onrender.com/music/v1";
  var nativeEventSource = window.EventSource;
  var mediaSource = Object.getOwnPropertyDescriptor(window.HTMLMediaElement.prototype, "src");

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

  function audioUrl(value) {
    var url = parseUrl(value);
    if (!url) return value;
    var match = url.pathname.match(/^\/api\/sp\/audio\/([A-Za-z0-9_-]{6,20})$/);
    return match ? API_BASE + "/audio/" + encodeURIComponent(match[1]) : value;
  }

  if (typeof nativeEventSource === "function") {
    function NeoMusicEventSource(value, options) {
      return new nativeEventSource(catalogUrl(value), options);
    }
    NeoMusicEventSource.prototype = nativeEventSource.prototype;
    Object.setPrototypeOf(NeoMusicEventSource, nativeEventSource);
    ["CONNECTING", "OPEN", "CLOSED"].forEach(function (name) {
      try { Object.defineProperty(NeoMusicEventSource, name, { value: nativeEventSource[name] }); } catch (error) {}
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
        if (next !== value && this instanceof window.HTMLAudioElement) this.crossOrigin = "anonymous";
        mediaSource.set.call(this, next);
      }
    });
  }

  window.__NEO_MUSIC_API__ = Object.freeze({
    base: API_BASE,
    catalogUrl: catalogUrl,
    audioUrl: audioUrl
  });
})();
