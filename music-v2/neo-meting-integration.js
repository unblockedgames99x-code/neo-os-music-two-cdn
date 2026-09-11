(function () {
  "use strict";

  if (window.__NEO_METING_INTEGRATION__) return;
  window.__NEO_METING_INTEGRATION__ = true;
  window.__NEO_MUSIC__ = true;

  var DIRECT_API_ORIGIN = "https://drfrost.site";
  var RELAY_API_BASE = "https://neo-stratus-api-w6nw.onrender.com/music/v1";
  var nativeEventSource = window.EventSource;
  var mediaSource = Object.getOwnPropertyDescriptor(window.HTMLMediaElement.prototype, "src");

  function parseUrl(value) {
    try { return new URL(String(value || ""), document.baseURI); } catch (error) { return null; }
  }

  function catalogUrls(value) {
    var url = parseUrl(value);
    if (!url) return [value];
    if (url.pathname === "/api/music/ytm/search") {
      return [DIRECT_API_ORIGIN + url.pathname + url.search, RELAY_API_BASE + "/search" + url.search];
    }
    if (url.pathname === "/api/music/ytm/home") {
      return [DIRECT_API_ORIGIN + url.pathname + url.search, RELAY_API_BASE + "/home" + url.search];
    }
    return [value];
  }

  function audioUrls(value) {
    var url = parseUrl(value);
    if (!url) return [value];
    var match = url.pathname.match(/^\/api\/sp\/audio\/([A-Za-z0-9_-]{6,20})$/);
    return match ? [
      DIRECT_API_ORIGIN + "/api/sp/audio/" + encodeURIComponent(match[1]),
      RELAY_API_BASE + "/audio/" + encodeURIComponent(match[1])
    ] : [value];
  }

  if (typeof nativeEventSource === "function") {
    function NeoMusicEventSource(value, options) {
      var urls = catalogUrls(value);
      if (urls.length === 1) return new nativeEventSource(urls[0], options);

      Object.defineProperties(this, {
        url: { value: urls[0], writable: true, enumerable: true },
        withCredentials: { value: Boolean(options && options.withCredentials), enumerable: true },
        readyState: { value: nativeEventSource.CONNECTING, writable: true, enumerable: true }
      });
      this.onopen = null;
      this.onmessage = null;
      this.onerror = null;
      this._urls = urls;
      this._index = 0;
      this._source = null;
      this._listeners = { open: new Set(), message: new Set(), error: new Set() };
      this._options = options;
      this._closed = false;
      this._connect();
    }

    NeoMusicEventSource.prototype = Object.create(nativeEventSource.prototype);
    NeoMusicEventSource.prototype.constructor = NeoMusicEventSource;
    NeoMusicEventSource.prototype._emit = function (type, event) {
      var handler = this["on" + type];
      if (typeof handler === "function") handler.call(this, event);
      this._listeners[type].forEach(function (listener) {
        if (typeof listener === "function") listener.call(this, event);
        else if (listener && typeof listener.handleEvent === "function") listener.handleEvent(event);
      }, this);
    };
    NeoMusicEventSource.prototype._connect = function () {
      var self = this;
      if (self._closed) return;
      self.url = self._urls[self._index];
      self.readyState = nativeEventSource.CONNECTING;
      var source = new nativeEventSource(self.url, self._options);
      self._source = source;
      source.onopen = function (event) {
        self.readyState = nativeEventSource.OPEN;
        self._emit("open", event);
      };
      source.onmessage = function (event) { self._emit("message", event); };
      source.onerror = function (event) {
        source.close();
        if (!self._closed && self._index + 1 < self._urls.length) {
          self._index += 1;
          self._connect();
          return;
        }
        self.readyState = nativeEventSource.CLOSED;
        self._emit("error", event);
      };
    };
    NeoMusicEventSource.prototype.addEventListener = function (type, listener) {
      if (this._listeners[type] && listener) this._listeners[type].add(listener);
    };
    NeoMusicEventSource.prototype.removeEventListener = function (type, listener) {
      if (this._listeners[type]) this._listeners[type].delete(listener);
    };
    NeoMusicEventSource.prototype.dispatchEvent = function (event) {
      if (!event || !this._listeners[event.type]) return false;
      this._emit(event.type, event);
      return true;
    };
    NeoMusicEventSource.prototype.close = function () {
      this._closed = true;
      this.readyState = nativeEventSource.CLOSED;
      if (this._source) this._source.close();
    };
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
        var urls = audioUrls(value);
        var next = urls[0];
        if (urls.length > 1 && this instanceof window.HTMLAudioElement) {
          var audio = this;
          audio.removeAttribute("crossorigin");
          audio.addEventListener("error", function tryRelay() {
            audio.removeEventListener("error", tryRelay);
            if (audio.src !== urls[0]) return;
            mediaSource.set.call(audio, urls[1]);
            audio.play().catch(function () {});
          });
        }
        mediaSource.set.call(this, next);
      }
    });
  }

  window.__NEO_MUSIC_API__ = Object.freeze({
    base: DIRECT_API_ORIGIN,
    fallbackBase: RELAY_API_BASE,
    catalogUrl: function (value) { return catalogUrls(value)[0]; },
    catalogUrls: catalogUrls,
    audioUrl: function (value) { return audioUrls(value)[0]; },
    audioUrls: audioUrls
  });
})();
