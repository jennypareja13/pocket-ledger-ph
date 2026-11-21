export type CacheRequestLike = Pick<Request, "method" | "url" | "headers">;

const EXCLUDED_PATHS = [
  /^\/(?:auth|rest\/v1|storage\/v1|functions\/v1|realtime\/v1)(?:\/|$)/i,
  /^\/(?:api|_serverFn|__serverFn)(?:\/|$)/i,
];

export function isCacheableRequest(request: CacheRequestLike, origin: string): boolean {
  if (request.method.toUpperCase() !== "GET") return false;

  const url = new URL(request.url, origin);
  if (url.origin !== origin) return false;
  if (request.headers.has("authorization")) return false;

  return !EXCLUDED_PATHS.some((pattern) => pattern.test(url.pathname));
}

export function isCacheableResponse(status: number, responseType = "basic"): boolean {
  return status === 200 && responseType !== "opaque";
}

export function serviceWorkerCacheName(kind: "shell" | "assets" | "meta", version: string): string {
  return `pocketvault-${kind}-${version}`;
}

export function chooseNavigationFallback<T>(
  exactPage: T | undefined,
  rootPage: T | undefined,
  offlinePage: T,
): T {
  return exactPage ?? rootPage ?? offlinePage;
}

export function isPreviewHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return (
    normalized.startsWith("id-preview--") ||
    normalized.endsWith(".lovableproject.com") ||
    normalized.endsWith(".lovable.dev")
  );
}

export function shouldRegisterServiceWorker(input: {
  production: boolean;
  topLevel: boolean;
  secureContext: boolean;
  hostname: string;
}): boolean {
  return (
    input.production && input.topLevel && input.secureContext && !isPreviewHostname(input.hostname)
  );
}

export function shellAssetFingerprintSource(html: string, origin: string): string | null {
  const assets = new Set<string>();
  const assetAttribute = /(?:src|href)=["']([^"']+)["']/gi;

  for (const match of html.matchAll(assetAttribute)) {
    const value = match[1];
    if (!value || !/\.(?:m?js|css)(?:[?#].*)?$/i.test(value)) continue;

    try {
      const url = new URL(value, origin);
      if (url.origin === origin) assets.add(url.href);
    } catch {
      // Ignore malformed references; valid references still form the fingerprint.
    }
  }

  return assets.size > 0 ? [...assets].sort().join("\n") : null;
}

export function hasShellUpdate(previous: string | null, current: string | null): boolean {
  return Boolean(previous && current && previous !== current);
}

export function selectCacheEntriesToEvict(
  entriesOldestFirst: string[],
  protectedEntries: ReadonlySet<string>,
  maxEntries: number,
): string[] {
  if (entriesOldestFirst.length <= maxEntries) return [];

  let remaining = entriesOldestFirst.length;
  const evictions: string[] = [];

  for (const entry of entriesOldestFirst) {
    if (remaining <= maxEntries) break;
    if (protectedEntries.has(entry)) continue;
    evictions.push(entry);
    remaining -= 1;
  }

  return evictions;
}
