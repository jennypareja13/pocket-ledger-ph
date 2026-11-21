/* global self, caches, Response, Request, fetch, AbortController, URL, setTimeout, clearTimeout */
/* PocketVault offline worker. Keep this file dependency-free and safe to disable. */
const CACHE_VERSION = "v1";
const SHELL_CACHE = `pocketvault-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `pocketvault-assets-${CACHE_VERSION}`;
const CACHE_PREFIX = "pocketvault-";
const MAX_CACHE_ENTRIES = 120;
const NAVIGATION_TIMEOUT_MS = 3000;

/*
 * One-file emergency kill switch:
 * Change this value to true, publish, and let the new worker activate.
 * It unregisters itself and deletes every PocketVault-owned Cache API cache.
 */
const KILL_SWITCH = false;

function offlineFallbackResponse() {
  return new Response(
    "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>PocketVault offline</title><body style=\"font:16px system-ui,sans-serif;padding:2rem;max-width:34rem;margin:auto\"><h1>PocketVault is offline</h1><p>The app shell is not available yet. Connect to the internet, open PocketVault once, then try again.</p></body></html>",
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

function isExcludedPath(pathname) {
  return (
    /^\/(?:auth\/v1|rest\/v1|storage\/v1|functions\/v1|realtime\/v1)(?:\/|$)/i.test(pathname) ||
    /^\/(?:api|_serverFn|__serverFn)(?:\/|$)/i.test(pathname)
  );
}

function isCacheableRequest(request, url) {
  if (request.method.toUpperCase() !== "GET") return false;
  if (url.origin !== self.location.origin) return false;
  if (request.headers.has("authorization")) return false;
  if (isExcludedPath(url.pathname)) return false;
  return true;
}

function isCacheableResponse(response) {
  return response.status === 200 && response.type !== "opaque";
}

function isHtmlResponse(response) {
  return (response.headers.get("content-type") || "").toLowerCase().includes("text/html");
}

function isStaticAsset(request) {
  return ["script", "style", "font", "image", "manifest"].includes(request.destination);
}

function isHashedAsset(url) {
  return /(?:^|[.-])[a-z0-9_-]{8,}\.(?:js|css|woff2?|ttf|otf|png|jpe?g|svg|webp|avif)$/i.test(
    url.pathname,
  );
}

async function trimCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_CACHE_ENTRIES) return;
  await Promise.all(keys.slice(0, keys.length - MAX_CACHE_ENTRIES).map((key) => cache.delete(key)));
}

async function cacheResponse(cacheName, request, response) {
  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
  await trimCache(cache);
}

async function fetchWithTimeout(request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NAVIGATION_TIMEOUT_MS);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function precacheAppShellAndAssets() {
  const rootUrl = new URL("/", self.location.origin);
  const rootRequest = new Request(rootUrl.href, { cache: "reload" });
  const shellCache = await caches.open(SHELL_CACHE);

  try {
    const response = await fetchWithTimeout(rootRequest);
    if (!isCacheableResponse(response) || !isHtmlResponse(response)) return;
    await cacheResponse(SHELL_CACHE, rootRequest, response);

    const html = await response.clone().text();
    const candidates = new Set();
    const assetAttribute = /(?:src|href)=["']([^"']+)["']/gi;
    for (const match of html.matchAll(assetAttribute)) {
      const value = match[1];
      if (value && /\.(?:m?js|css)(?:[?#].*)?$/i.test(value)) {
        const url = new URL(value, rootUrl);
        if (url.origin === self.location.origin) candidates.add(url.href);
      }
    }

    /*
     * Follow static and dynamic JS imports so code-split route chunks referenced
     * by the entry bundle are available after a first online load.
     */
    const pending = [...candidates];
    const visited = new Set();
    while (pending.length > 0 && visited.size < MAX_CACHE_ENTRIES) {
      const href = pending.shift();
      if (!href || visited.has(href)) continue;
      visited.add(href);

      try {
        const request = new Request(href);
        if (!isCacheableRequest(request, new URL(href))) continue;
        const assetResponse = await fetchWithTimeout(request);
        if (!isCacheableResponse(assetResponse)) continue;
        await cacheResponse(ASSET_CACHE, request, assetResponse);

        const pathname = new URL(href).pathname;
        const source = await assetResponse.clone().text();
        if (/\.m?js$/i.test(pathname)) {
          const importPattern = /(?:\bfrom\s*|\bimport\s*\(\s*)["']([^"']+\.m?js(?:[?#][^"']*)?)["']/g;
          for (const match of source.matchAll(importPattern)) {
            const imported = new URL(match[1], href);
            if (imported.origin === self.location.origin && !visited.has(imported.href)) {
              pending.push(imported.href);
            }
          }
        } else if (/\.css$/i.test(pathname)) {
          const cssAssetPattern = /url\(\s*["']?([^"')]+)["']?\s*\)/g;
          for (const match of source.matchAll(cssAssetPattern)) {
            const imported = new URL(match[1], href);
            if (
              imported.origin === self.location.origin &&
              !imported.href.startsWith("data:") &&
              !visited.has(imported.href)
            ) {
              pending.push(imported.href);
            }
          }
        }
      } catch {
        // A missing optional chunk should not prevent the shell from being installed.
      }
    }
  } catch {
    // Installation can still complete; runtime navigation caching may fill the shell.
  }
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetchWithTimeout(request);
    if (isCacheableResponse(response) && isHtmlResponse(response)) {
      await cacheResponse(SHELL_CACHE, request, response);
    }
    return response;
  } catch {
    const exactPage = await cache.match(request);
    const rootPage = await cache.match(new URL("/", self.location.origin).href);
    return exactPage || rootPage || offlineFallbackResponse();
  }
}

async function cacheFirstHashedAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (isCacheableResponse(response)) await cacheResponse(ASSET_CACHE, request, response);
  return response;
}

async function networkFirstAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  try {
    const response = await fetch(request);
    if (isCacheableResponse(response)) await cacheResponse(ASSET_CACHE, request, response);
    return response;
  } catch {
    return (await cache.match(request)) || Response.error();
  }
}

async function deletePocketVaultCachesExceptCurrent() {
  const names = await caches.keys();
  await Promise.all(
    names
      .filter(
        (name) =>
          name.startsWith(CACHE_PREFIX) && name !== SHELL_CACHE && name !== ASSET_CACHE,
      )
      .map((name) => caches.delete(name)),
  );
}

async function clearPocketVaultCaches() {
  const names = await caches.keys();
  await Promise.all(
    names.filter((name) => name.startsWith(CACHE_PREFIX)).map((name) => caches.delete(name)),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      if (KILL_SWITCH) return;
      await precacheAppShellAndAssets();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      if (KILL_SWITCH) {
        await self.registration.unregister();
        await clearPocketVaultCaches();
        return;
      }
      await deletePocketVaultCachesExceptCurrent();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING" && !KILL_SWITCH) {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  if (KILL_SWITCH) return;

  const request = event.request;
  const url = new URL(request.url);
  if (!isCacheableRequest(request, url)) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (!isStaticAsset(request)) return;

  if (isHashedAsset(url)) {
    event.respondWith(cacheFirstHashedAsset(request));
  } else {
    event.respondWith(networkFirstAsset(request));
  }
});
