const OPT_IN_KEY = "pocketvault-offline-opt-in";
const DISABLED_VERSION_KEY = "pocketvault-service-worker-disabled-version";
const SERVICE_WORKER_VERSION = "v2";
const CACHE_PREFIX = "pocketvault-";

function isPreviewHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return normalized.startsWith("id-preview--") ||
    normalized.endsWith(".lovableproject.com") ||
    normalized.endsWith(".lovable.dev");
}

export function shouldRegisterServiceWorker(input: {
  production: boolean;
  topLevel: boolean;
  secureContext: boolean;
  hostname: string;
  optedIn: boolean;
}): boolean {
  return input.production && input.topLevel && input.secureContext &&
    input.optedIn && !isPreviewHostname(input.hostname);
}

export function getBootFingerprint(html: string, origin: string): string | null {
  const match = html.match(/<script\b(?=[^>]*\btype=["']module["'])(?=[^>]*\bsrc=["']([^"']+)["'])[^>]*>/i);
  if (!match?.[1]) return null;
  try {
    const url = new URL(match[1], origin);
    return url.origin === origin && url.pathname.startsWith("/assets/") ? url.pathname : null;
  } catch {
    return null;
  }
}

export function hasRunningAppUpdate(runningFingerprint: string | null, latestFingerprint: string | null): boolean {
  return Boolean(runningFingerprint && latestFingerprint && runningFingerprint !== latestFingerprint);
}

async function clearPocketVaultCaches(): Promise<void> {
  if (!("caches" in window)) return;
  const names = await window.caches.keys();
  await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX)).map((name) => window.caches.delete(name)));
}

async function unregisterPocketVaultWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations
    .filter((registration) => new URL(registration.active?.scriptURL || registration.waiting?.scriptURL || registration.installing?.scriptURL || window.location.href).pathname === "/sw.js")
    .map((registration) => registration.unregister()));
}

function consumeOfflineQuery(): "enable" | "disable" | null {
  const url = new URL(window.location.href);
  const value = url.searchParams.get("offline");
  if (value !== "1" && value !== "0") return null;
  url.searchParams.delete("offline");
  window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  return value === "1" ? "enable" : "disable";
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || typeof navigator === "undefined") return null;

  const queryAction = consumeOfflineQuery();
  if (queryAction === "enable") {
    window.localStorage.setItem(OPT_IN_KEY, "true");
  } else if (queryAction === "disable") {
    window.localStorage.removeItem(OPT_IN_KEY);
    window.localStorage.removeItem(DISABLED_VERSION_KEY);
    await unregisterPocketVaultWorker();
    await clearPocketVaultCaches();
    return null;
  }

  const optedIn = window.localStorage.getItem(OPT_IN_KEY) === "true";
  const disabledVersion = window.localStorage.getItem(DISABLED_VERSION_KEY);
  if (disabledVersion && disabledVersion !== SERVICE_WORKER_VERSION) {
    window.localStorage.removeItem(DISABLED_VERSION_KEY);
  } else if (disabledVersion === SERVICE_WORKER_VERSION) {
    return null;
  }

  if (!("serviceWorker" in navigator)) return null;

  let topLevel = false;
  try {
    topLevel = window.top === window.self;
  } catch {
    topLevel = false;
  }

  if (!shouldRegisterServiceWorker({
    production: import.meta.env.PROD,
    topLevel,
    secureContext: window.isSecureContext,
    hostname: window.location.hostname,
    optedIn,
  })) return null;

  try {
    return await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
  } catch (error) {
    console.warn("PocketVault offline support could not be registered.", error);
    return null;
  }
}

export async function checkForRunningAppUpdate(runningFingerprint: string): Promise<boolean> {
  try {
    const response = await fetch("/", { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) return false;
    const html = await response.text();
    return hasRunningAppUpdate(runningFingerprint, getBootFingerprint(html, window.location.origin));
  } catch {
    return false;
  }
}

export { OPT_IN_KEY, DISABLED_VERSION_KEY, SERVICE_WORKER_VERSION };
