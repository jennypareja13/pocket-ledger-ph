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

export function serviceWorkerCacheName(kind: "shell" | "assets", version: string): string {
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
  hostname: string;
}): boolean {
  return input.production && input.topLevel && !isPreviewHostname(input.hostname);
}
