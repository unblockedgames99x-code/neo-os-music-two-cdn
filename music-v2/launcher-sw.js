const APP_ROUTE = "__neo_app__/";
const PROXY_ROUTE_MARKER = "/browse-v69/";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function prepareAppDocument(source) {
  const baseUrl = new URL("./", self.location.href).href;
  let html = String(source || "")
    .replace(/<meta\b[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/gi, "");
  const base = `<base href="${baseUrl.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}" target="_self">`;
  const runner = '<meta name="neo-runner" content="github-jsdelivr">';
  if (/<base\b[^>]*>/i.test(html)) html = html.replace(/<base\b[^>]*>/i, base + runner);
  else if (/<head(?:\s[^>]*)?>/i.test(html)) html = html.replace(/<head(?:\s[^>]*)?>/i, (head) => head + base + runner);
  return html;
}

function proxiedResourceTarget(requestUrl) {
  const markerIndex = requestUrl.pathname.lastIndexOf(PROXY_ROUTE_MARKER);
  if (markerIndex < 0) return null;
  try {
    let decoded = decodeURIComponent(requestUrl.pathname.slice(markerIndex + PROXY_ROUTE_MARKER.length));
    decoded = decoded.replace(/^(https?):\/(?!\/)/i, "$1://");
    const target = new URL(decoded);
    return /^https?:$/.test(target.protocol) ? target : null;
  } catch (error) {
    return null;
  }
}

async function fetchProxiedResource(request, target) {
  const headers = new Headers();
  for (const name of ["accept", "accept-language", "if-modified-since", "if-none-match", "if-range", "range"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const upstream = await fetch(target.href, {
    method: request.method,
    headers,
    credentials: "omit",
    redirect: "follow",
    cache: request.cache === "only-if-cached" ? "default" : request.cache,
  });
  const responseHeaders = new Headers(upstream.headers);
  for (const name of ["content-encoding", "content-security-policy", "cross-origin-resource-policy", "set-cookie", "transfer-encoding"]) {
    responseHeaders.delete(name);
  }
  responseHeaders.set("x-neo-resource-proxy", "music-service-worker");
  return new Response(request.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  const resourceTarget = proxiedResourceTarget(requestUrl);
  if (resourceTarget && ["GET", "HEAD"].includes(event.request.method)) {
    event.respondWith(fetchProxiedResource(event.request, resourceTarget));
    return;
  }
  const appUrl = new URL(APP_ROUTE, self.registration.scope);
  if (event.request.mode !== "navigate" || requestUrl.origin !== appUrl.origin || requestUrl.pathname !== appUrl.pathname) return;
  event.respondWith(
    fetch(new URL("index.html?neo-app-shell=1&v=20260912-home-warm-v1", self.location.href), { cache: "force-cache", credentials: "omit" })
      .then((response) => {
        if (!response.ok) throw new Error(`App document returned ${response.status}.`);
        return response.text();
      })
      .then((source) => new Response(prepareAppDocument(source), {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        },
      }))
  );
});
