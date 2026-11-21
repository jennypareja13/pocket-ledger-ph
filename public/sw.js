/* global self, caches, Response, Request, fetch, AbortController, URL, setTimeout, clearTimeout */
const CACHE_VERSION = "v1";
const SHELL_CACHE = `pocketvault-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `pocketvault-assets-${CACHE_VERSION}`;
const META_CACHE = `pocketvault-meta-${CACHE_VERSION}`;
const CACHE_PREFIX = "pocketvault-";
const MAX_CACHE_ENTRIES = 120;
const NAVIGATION_TIMEOUT_MS = 3000;
const MANIFEST_URL = "/__pocketvault_current_assets__";

/*
 * Emergency kill switch. Set true, publish, then let the new worker activate.
 * Activation unregisters this worker and deletes only caches with CACHE_PREFIX.
 * It never accesses IndexedDB or ledger records.
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

async function fetchWithTimeout(request) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NAVIGATION_TIMEOUT_MS);
  try {
    return await fetch(request, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function readCurrentManifest() {
  const cache = await caches.open(META_CACHE);
  const response = await cache.match(MANIFEST_URL);
  if (!response) return { fingerprint: null, assets: [] };
  try {
    return await response.json();
  } catch {
    return { fingerprint: null, assets: [] };
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
      if (url.origin === self.location.origin) assets.add(url.href);
    } catch {
      // Ignore malformed HTML references; keep valid candidates.
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
      if (url.origin === self.location.origin && !url.href.startsWith("data:")) {
        dependencies.add(url.href);
      }
    } catch {
      throw new Error("A local asset reference could not be resolved.");
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
  const urls = keys.map((request) => request.url);
  const evictions = [];
  let remaining = urls.length;

  for (let index = 0; index < urls.length && remaining > MAX_CACHE_ENTRIES; index += 1) {
    if (protectedAssets.has(urls[index])) continue;
    evictions.push(keys[index]);
    remaining -= 1;
  }

  await Promise.all(evictions.map((request) => cache.delete(request)));
}

async function warmShellAssets(html, baseUrl, notifyClients) {
  const roots = discoverShellAssets(html, baseUrl);
  const fingerprint = roots.join("\n");
  const previous = await readCurrentManifest();
  if (previous.fingerprint === fingerprint && previous.assets?.length) {
    if (previous.updatePending) {
      await writeCurrentManifest({ ...previous, updatePending: false });
    }
    return { success: true, assets: previous.assets, fingerprint, changed: false };
  }

  const pending = [...roots];
  const visited = new Set();
  const failed = [];
  const protectedAssets = new Set();

  while (pending.length > 0 && visited.size < MAX_CACHE_ENTRIES) {
    const href = pending.shift();
    if (!href || visited.has(href)) continue;
    visited.add(href);

    try {
      const request = new Request(href);
      const url = new URL(href);
      if (!isCacheableRequest(request, url)) continue;

      const response = await fetchWithTimeout(request);
      if (!isCacheableResponse(response)) {
        failed.push(href);
        continue;
      }

      const cache = await caches.open(ASSET_CACHE);
      await cache.put(request, response.clone());
      protectedAssets.add(href);

      const source = await response.clone().text();
      for (const dependency of await discoverDependencies(href, source)) {
        if (!visited.has(dependency)) pending.push(dependency);
      }
    } catch {
      failed.push(href);
      // Parse or fetch failures are contained; the previous manifest stays active.
    }
  }

  if (pending.length > 0) failed.push(...pending);
  if (failed.length > 0) {
    await writeCurrentManifest({ ...previous, warmFailed: true });
    await trimAssetCache(new Set(previous.assets || []));
    await notifyClients({
      type: "SHELL_ASSET_WARM_FAILED",
      message:
        "Some app files could not be saved. Keep PocketVault online and retry before going offline.",
    });
    return {
      success: false,
      assets: [...protectedAssets],
      fingerprint,
      changed: false,
    };
  }

  const updatePending = Boolean(previous.fingerprint && previous.fingerprint !== fingerprint);
  await writeCurrentManifest({
    fingerprint,
    assets: [...protectedAssets],
    updatePending,
    warmFailed: false,
  });
  await trimAssetCache(protectedAssets);
  return { success: true, assets: [...protectedAssets], fingerprint, changed: updatePending };
}
async function notifyClients(message) {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients) client.postMessage(message);
}

async function saveNavigationDocument(request, response) {
  const cache = await caches.open(SHELL_CACHE);
  await cache.put(request, response.clone());
}

async function networkFirstNavigation(request) {
  const shellCache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetchWithTimeout(request);
    if (isCacheableResponse(response) && isHtmlResponse(response)) {
      const html = await response.clone().text();
      const result = await warmShellAssets(html, new URL(request.url), notifyClients);
      if (result.success) {
        await shellCache.put(request, response.clone());
        if (result.changed) await notifyClients({ type: "SHELL_UPDATED" });
      }
    }
    return response;
  } catch {
    const exactPage = await shellCache.match(request);
    const rootPage = await shellCache.match(new URL("/", self.location.origin).href);
    return exactPage || rootPage || offlineFallbackResponse();
  }
}
function missingAssetResponse(request) {
  if (request.destination === "script") {
    return new Response(
      'document.body.innerHTML = \'<main style="font:16px system-ui,sans-serif;padding:2rem;max-width:36rem;margin:auto"><h1>You are offline</h1><p>Your saved records are safe on this device. PocketVault will sync them when you are back online.</p><p>This app file is not available offline yet. Reconnect and retry.</p><button onclick="location.reload()">Retry</button></main>\';',
      { status: 200, headers: { "Content-Type": "text/javascript; charset=utf-8" } },
    );
  }
  if (request.destination === "style") {
    return new Response(
      "body::before{content:'PocketVault is offline. Your saved records remain safe on this device and will sync when you are back online.';display:block;padding:1rem;font:16px system-ui,sans-serif}",
      { status: 200, headers: { "Content-Type": "text/css; charset=utf-8" } },
    );
  }
  return Response.error();
}

async function cacheFirstHashedAsset(request) {
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
    return missingAssetResponse(request);
  }
}

async function deletePocketVaultCachesExceptCurrent() {
  const names = await caches.keys();
  await Promise.all(
    names
      .filter(
        (name) =>
          name.startsWith(CACHE_PREFIX) && ![SHELL_CACHE, ASSET_CACHE, META_CACHE].includes(name),
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
      const root = new Request(new URL("/", self.location.origin), { cache: "reload" });
      try {
        const response = await fetchWithTimeout(root);
        if (isCacheableResponse(response) && isHtmlResponse(response)) {
          const html = await response.clone().text();
          const result = await warmShellAssets(html, new URL(root.url), notifyClients);
          if (result.success) await saveNavigationDocument(root, response);
        }
      } catch {
        // Install remains non-fatal; runtime navigation will retry warming.
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
        return;
      }
      await deletePocketVaultCachesExceptCurrent();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "CHECK_SHELL_UPDATE") {
    event.waitUntil(
      readCurrentManifest().then((manifest) => {
        if (manifest.updatePending) {
          event.source?.postMessage({ type: "SHELL_UPDATED" });
        }
        if (manifest.warmFailed) {
          event.source?.postMessage({ type: "SHELL_ASSET_WARM_FAILED" });
        }
      }),
    );
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

  if (isStaticAsset(request) && isHashedAsset(url)) {
    event.respondWith(cacheFirstHashedAsset(request));
  }
});
