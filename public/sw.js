/* global self, caches, Response, Request, fetch, AbortController, URL, setTimeout, clearTimeout, Date, Promise, Set, Map, Array */
const CACHE_VERSION = "v2";
const SHELL_CACHE = "pocketvault-shell-" + CACHE_VERSION;
const ASSET_CACHE = "pocketvault-assets-" + CACHE_VERSION;
const META_CACHE = "pocketvault-meta-" + CACHE_VERSION;
const CACHE_PREFIX = "pocketvault-";
const MAX_ASSET_ENTRIES = 120;
const MAX_SHELL_ENTRIES = 20;
const NAVIGATION_TIMEOUT_MS = 3000;
const ASSET_TIMEOUT_MS = 30000;
const WARM_BACKOFF_MS = 10 * 60 * 1000;
const MAX_CONCURRENT_ASSETS = 4;
const MANIFEST_URL = "/__pocketvault_current_assets__";
const SENSITIVE_QUERY_PARAMS = new Set([
  "code",
  "access_token",
  "refresh_token",
  "error",
  "error_description",
  "state",
]);

/*
 * Emergency kill switch. Set true and publish. Install calls skipWaiting()
 * immediately; activation unregisters this worker and deletes only PocketVault
 * CacheStorage entries. It never accesses IndexedDB or ledger records.
 */
const KILL_SWITCH = false;

function offlineFallbackResponse() {
  return new Response(
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PocketVault offline</title><body style="font:16px system-ui,sans-serif;padding:2rem;max-width:36rem;margin:auto"><h1>You are offline</h1><p>Your saved records are safe on this device. PocketVault will sync them when you are back online.</p><p>This page or one of its app files is not available offline yet. Connect to the internet, reopen PocketVault, and try again.</p><button onclick="location.reload()" style="padding:.7rem 1rem;border:0;border-radius:.5rem;background:#176975;color:white;font:inherit">Retry</button></body></html>',
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

function isExcludedPath(pathname) {
  return (
    /^\/(?:auth|rest\/v1|storage\/v1|functions\/v1|realtime\/v1)(?:\/|$)/i.test(pathname) ||
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

function hasSensitiveNavigationParams(url) {
  for (const key of url.searchParams.keys()) {
    if (SENSITIVE_QUERY_PARAMS.has(key.toLowerCase())) return true;
  }
  return false;
}

function navigationCacheKey(url) {
  return new Request(url.origin + url.pathname, { method: "GET" });
}

function isCacheableResponse(response) {
  return response.status === 200 && response.type !== "opaque";
}

function isHtmlResponse(response) {
  return (response.headers.get("content-type") || "").toLowerCase().includes("text/html");
}

function isBuildAsset(request, url) {
  return (
    url.origin === self.location.origin &&
    url.pathname.startsWith("/assets/") &&
    ["script", "style", "font", "image"].includes(request.destination)
  );
}

function fetchAssetWithTimeout(request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ASSET_TIMEOUT_MS);
  return fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timeout));
}

async function readCurrentManifest() {
  const cache = await caches.open(META_CACHE);
  const response = await cache.match(MANIFEST_URL);
  if (!response) return { fingerprint: null, assets: [], lastAttempt: 0, warmFailed: false };
  try {
    return await response.json();
  } catch {
    return { fingerprint: null, assets: [], lastAttempt: 0, warmFailed: false };
  }
}

async function writeCurrentManifest(manifest) {
  const cache = await caches.open(META_CACHE);
  await cache.put(
    MANIFEST_URL,
    new Response(JSON.stringify(manifest), {
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function discoverShellAssets(html, baseUrl) {
  const assets = new Set();
  const attributePattern = /(?:src|href)=["']([^"']+)["']/gi;
  for (const match of html.matchAll(attributePattern)) {
    const value = match[1];
    if (!value || !/\.(?:m?js|css)(?:[?#].*)?$/i.test(value)) continue;
    try {
      const url = new URL(value, baseUrl);
      if (url.origin === self.location.origin && url.pathname.startsWith("/assets/")) {
        assets.add(url.href);
      }
    } catch {
      // Ignore malformed references; valid local build assets remain eligible.
    }
  }
  return [...assets].sort();
}

async function discoverDependencies(assetUrl, source) {
  const pathname = new URL(assetUrl).pathname;
  const dependencies = new Set();
  const addReference = (value) => {
    try {
      const url = new URL(value, assetUrl);
      if (
        url.origin === self.location.origin &&
        url.pathname.startsWith("/assets/") &&
        !url.href.startsWith("data:")
      ) {
        dependencies.add(url.href);
      }
    } catch {
      throw new Error("A local build-asset reference could not be resolved.");
    }
  };

  if (/\.m?js$/i.test(pathname)) {
    const importPattern = /(?:\bfrom\s*|\bimport\s*\(\s*)["']([^"']+)["']/g;
    const assetPattern =
      /["']([^"']+\.(?:css|woff2?|ttf|otf|png|jpe?g|svg|webp|avif)(?:[?#][^"']*)?)["']/gi;
    let parsedImports = 0;
    for (const match of source.matchAll(importPattern)) {
      if (/\.(?:m?js)(?:[?#].*)?$/i.test(match[1])) {
        addReference(match[1]);
        parsedImports += 1;
      }
    }
    for (const match of source.matchAll(assetPattern)) addReference(match[1]);
    if (/\bimport\s*\(/.test(source) && parsedImports === 0) {
      throw new Error("Dynamic imports were present but could not be discovered.");
    }
  } else if (/\.css$/i.test(pathname)) {
    const cssPattern = /url\(\s*["']?([^"')]+)["']?\s*\)/g;
    let parsedUrls = 0;
    for (const match of source.matchAll(cssPattern)) {
      addReference(match[1]);
      parsedUrls += 1;
    }
    if (/url\s*\(/i.test(source) && parsedUrls === 0) {
      throw new Error("CSS asset references were present but could not be discovered.");
    }
  }

  return [...dependencies];
}

async function trimAssetCache(protectedAssets) {
  const cache = await caches.open(ASSET_CACHE);
  const keys = await cache.keys();
  let remaining = keys.length;
  const evictions = [];
  for (const request of keys) {
    if (remaining <= MAX_ASSET_ENTRIES) break;
    if (protectedAssets.has(request.url)) continue;
    evictions.push(request);
    remaining -= 1;
  }
  await Promise.all(evictions.map((request) => cache.delete(request)));
}

async function trimShellCache() {
  const cache = await caches.open(SHELL_CACHE);
  const keys = await cache.keys();
  let remaining = keys.length;
  const evictions = [];
  for (const request of keys) {
    if (remaining <= MAX_SHELL_ENTRIES) break;
    if (new URL(request.url).pathname === "/") continue;
    evictions.push(request);
    remaining -= 1;
  }
  await Promise.all(evictions.map((request) => cache.delete(request)));
}

async function saveShellDocument(url, response) {
  if (hasSensitiveNavigationParams(url)) return;
  const cache = await caches.open(SHELL_CACHE);
  const key = navigationCacheKey(url);
  await cache.delete(key);
  await cache.put(key, response.clone());
  await trimShellCache();
}

async function warmShellAssets(html, rootUrl) {
  const roots = discoverShellAssets(html, rootUrl);
  if (roots.length === 0) throw new Error("The root document did not expose build assets.");

  const fingerprint = roots.join("\n");
  const previous = await readCurrentManifest();
  const assetCache = await caches.open(ASSET_CACHE);

  if (previous.fingerprint === fingerprint && Array.isArray(previous.assets) && previous.assets.length) {
    const missing = [];
    for (const asset of previous.assets) {
      if (!(await assetCache.match(asset))) missing.push(asset);
    }
    if (missing.length === 0) return { success: true, assets: previous.assets, fingerprint };
  }

  const now = Date.now();
  if (previous.warmFailed && previous.lastAttempt && now - previous.lastAttempt < WARM_BACKOFF_MS) {
    throw new Error("Asset warming is in backoff after a previous failure.");
  }
  await writeCurrentManifest({ ...previous, lastAttempt: now });

  const queue = [...roots];
  const visited = new Set();
  const protectedAssets = new Set();
  const failed = [];

  while (queue.length > 0 && visited.size < MAX_ASSET_ENTRIES) {
    const batch = [];
    while (queue.length > 0 && batch.length < MAX_CONCURRENT_ASSETS && visited.size + batch.length < MAX_ASSET_ENTRIES) {
      const href = queue.shift();
      if (href && !visited.has(href)) {
        visited.add(href);
        batch.push(href);
      }
    }

    const results = await Promise.all(
      batch.map(async (href) => {
        try {
          const url = new URL(href);
          if (url.origin !== self.location.origin || !url.pathname.startsWith("/assets/")) {
            return { href, dependencies: [], success: true };
          }

          const request = new Request(href);
          let response = await assetCache.match(request);
          if (!response) {
            response = await fetchAssetWithTimeout(request);
            if (!isCacheableResponse(response)) throw new Error("Build asset response was not cacheable.");
            await assetCache.put(request, response.clone());
          }

          const source = await response.clone().text();
          const dependencies = await discoverDependencies(href, source);
          return { href, dependencies, success: true };
        } catch {
          return { href, dependencies: [], success: false };
        }
      }),
    );

    for (const result of results) {
      if (!result.success) {
        failed.push(result.href);
        continue;
      }
      protectedAssets.add(result.href);
      for (const dependency of result.dependencies) {
        if (!visited.has(dependency)) queue.push(dependency);
      }
    }
  }

  if (queue.length > 0) failed.push(...queue);
  if (failed.length > 0) {
    await writeCurrentManifest({ ...previous, lastAttempt: now, warmFailed: true });
    await trimAssetCache(new Set(previous.assets || []));
    await notifyClients({
      type: "SHELL_ASSET_WARM_FAILED",
      message: "Some app files could not be saved. Keep PocketVault online and retry before going offline.",
    });
    throw new Error("One or more build assets could not be warmed.");
  }

  await writeCurrentManifest({
    fingerprint,
    assets: [...protectedAssets],
    lastAttempt: now,
    warmFailed: false,
  });
  await trimAssetCache(protectedAssets);
  return { success: true, assets: [...protectedAssets], fingerprint };
}

async function notifyClients(message) {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients) client.postMessage(message);
}

async function warmFromRootDocument(rootResponse) {
  const html = await rootResponse.clone().text();
  const result = await warmShellAssets(html, new URL(self.location.origin + "/"));
  return result;
}

async function fetchRootDocument() {
  const rootRequest = new Request(self.location.origin + "/", { cache: "no-store" });
  const response = await fetch(rootRequest);
  if (!isCacheableResponse(response) || !isHtmlResponse(response)) {
    throw new Error("The root document could not be refreshed.");
  }
  return response;
}

async function warmFromNavigation(request, response) {
  try {
    const path = new URL(request.url).pathname;
    const rootResponse = path === "/" ? response.clone() : await fetchRootDocument();
    await warmFromRootDocument(rootResponse);
    await saveShellDocument(new URL(request.url), response);
    if (path === "/") await saveShellDocument(new URL(self.location.origin + "/"), rootResponse);
  } catch {
    await notifyClients({
      type: "SHELL_ASSET_WARM_FAILED",
      message: "Some app files could not be saved. Keep PocketVault online and reopen it before going offline.",
    });
  }
}

async function getNavigationFallback(url) {
  const cache = await caches.open(SHELL_CACHE);
  const exact = await cache.match(navigationCacheKey(url));
  if (exact) return exact;
  const root = await cache.match(new Request(self.location.origin + "/", { method: "GET" }));
  return root || offlineFallbackResponse();
}

async function networkFirstNavigation(request, event) {
  const url = new URL(request.url);
  if (hasSensitiveNavigationParams(url)) return fetch(request);

  const networkPromise = fetch(request).then(
    (response) => response,
    () => null,
  );

  let timeoutId;
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve(null), NAVIGATION_TIMEOUT_MS);
  });

  const firstResponse = await Promise.race([networkPromise, timeoutPromise]);
  clearTimeout(timeoutId);

  if (firstResponse) {
    if (isCacheableResponse(firstResponse) && isHtmlResponse(firstResponse)) {
      event.waitUntil(warmFromNavigation(request, firstResponse.clone()));
    }
    return firstResponse;
  }

  event.waitUntil(
    networkPromise.then((lateResponse) => {
      if (lateResponse && isCacheableResponse(lateResponse) && isHtmlResponse(lateResponse)) {
        return warmFromNavigation(request, lateResponse.clone());
      }
      return undefined;
    }),
  );
  return getNavigationFallback(url);
}

async function cacheFirstBuildAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (isCacheableResponse(response)) {
      await cache.put(request, response.clone());
      const manifest = await readCurrentManifest();
      await trimAssetCache(new Set(manifest.assets || []));
    }
    return response;
  } catch {
    return Response.error();
  }
}

async function deletePocketVaultCachesExceptCurrent() {
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith(CACHE_PREFIX) && ![SHELL_CACHE, ASSET_CACHE, META_CACHE].includes(name))
      .map((name) => caches.delete(name)),
  );
}

async function clearPocketVaultCaches() {
  const names = await caches.keys();
  await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX)).map((name) => caches.delete(name)));
}

self.addEventListener("install", (event) => {
  if (KILL_SWITCH) self.skipWaiting();
  event.waitUntil(
    (async () => {
      if (KILL_SWITCH) return;
      try {
        const root = await fetchRootDocument();
        await warmFromRootDocument(root);
        await saveShellDocument(new URL(self.location.origin + "/"), root);
      } catch {
        // Installation remains non-fatal; online navigation can retry after backoff.
      }
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      if (KILL_SWITCH) {
        await self.registration.unregister();
        await clearPocketVaultCaches();
        await notifyClients({ type: "POCKETVAULT_SW_DISABLED", version: CACHE_VERSION });
        await self.clients.claim();
        return;
      }
      await deletePocketVaultCachesExceptCurrent();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING" && !KILL_SWITCH) self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (KILL_SWITCH || !isCacheableRequest(request, url)) return;
  if (request.mode === "navigate") {
    if (hasSensitiveNavigationParams(url)) return;
    event.respondWith(networkFirstNavigation(request, event));
    return;
  }
  if (isBuildAsset(request, url)) event.respondWith(cacheFirstBuildAsset(request));
});
