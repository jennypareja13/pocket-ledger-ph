import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

const ORIGIN = "https://pocket-vault-bnpl.lovable.app";
const WORKER_SOURCE = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8");

type WorkerRequest = {
  url: string;
  method: string;
  headers: Headers;
  mode: string;
  destination: string;
};
type FetchInput = Request | Pick<WorkerRequest, "url"> | string;
type WorkerEvent = {
  request?: WorkerRequest;
  waitUntil?: (promise: Promise<unknown>) => void;
  respondWith?: (promise: Promise<Response>) => void;
  responsePromise?: Promise<Response>;
};
type WorkerHooks = {
  navigationCacheKey: (url: URL) => Request;
  hasSensitiveNavigationParams: (url: URL) => boolean;
  trimShellCache: () => Promise<void>;
  trimAssetCache: (protectedAssets: Set<string>) => Promise<void>;
  warmShellAssets: (html: string, rootUrl: URL) => Promise<unknown>;
  readCurrentManifest: () => Promise<unknown>;
  isBuildAsset: (request: Pick<WorkerRequest, "destination">, url: URL) => boolean;
};

function createWorker(
  options: {
    killSwitch?: boolean;
    fetch?: (request: FetchInput) => Promise<Response>;
  } = {},
) {
  const cachesMap = new Map<string, Map<string, Response>>();
  const listeners = new Map<string, (event: WorkerEvent) => void>();
  const calls = { fetch: [] as string[], skipWaiting: 0, unregister: 0, claim: 0 };
  const clients = [{ postMessage: vi.fn() }];
  const cacheStorage = {
    async open(name: string) {
      if (!cachesMap.has(name)) cachesMap.set(name, new Map());
      const entries = cachesMap.get(name)!;
      return {
        async match(input: Request | string) {
          const key = typeof input === "string" ? new URL(input, ORIGIN).href : input.url;
          return entries.get(key)?.clone();
        },
        async put(input: Request | string, response: Response) {
          const key = typeof input === "string" ? new URL(input, ORIGIN).href : input.url;
          entries.set(key, response.clone());
        },
        async delete(input: Request | string) {
          const key = typeof input === "string" ? new URL(input, ORIGIN).href : input.url;
          return entries.delete(key);
        },
        async keys() {
          return [...entries.keys()].map((url) => new Request(url));
        },
      };
    },
    async keys() {
      return [...cachesMap.keys()];
    },
    async delete(name: string) {
      return cachesMap.delete(name);
    },
  };

  const defaultFetch = async (input: FetchInput) => {
    const url = typeof input === "string" ? input : input.url;
    if (url === ORIGIN + "/" || url === ORIGIN + "/transactions") {
      return new Response(
        '<!doctype html><script type="module" src="/assets/index-12345678.js"></script>',
        { status: 200, headers: { "Content-Type": "text/html" } },
      );
    }
    if (url.startsWith(ORIGIN + "/assets/")) {
      return new Response("export const boot = true;", {
        status: 200,
        headers: { "Content-Type": "text/javascript" },
      });
    }
    return new Response("ok", { status: 200 });
  };

  const self = {
    location: { origin: ORIGIN },
    registration: {
      unregister: vi.fn(async () => {
        calls.unregister += 1;
        return true;
      }),
    },
    skipWaiting: vi.fn(() => {
      calls.skipWaiting += 1;
    }),
    clients: {
      matchAll: vi.fn(async () => clients),
      claim: vi.fn(async () => {
        calls.claim += 1;
      }),
    },
    addEventListener(type: string, handler: (event: WorkerEvent) => void) {
      listeners.set(type, handler);
    },
  };

  let source = WORKER_SOURCE;
  if (options.killSwitch)
    source = source.replace("const KILL_SWITCH = false;", "const KILL_SWITCH = true;");
  const context = vm.createContext({
    self,
    indexedDB: { open: vi.fn() },
    caches: cacheStorage,
    Request,
    Response,
    Headers,
    URL,
    AbortController,
    fetch: async (input: FetchInput) => {
      const url = typeof input === "string" ? input : input.url;
      calls.fetch.push(url);
      return (options.fetch || defaultFetch)(input);
    },
    setTimeout,
    clearTimeout,
    Date,
    Promise,
    Set,
    Map,
    Array,
    Error,
    console,
  });
  vm.runInContext(
    source +
      "\n;globalThis.__workerTest = { navigationCacheKey, hasSensitiveNavigationParams, trimShellCache, trimAssetCache, warmShellAssets, readCurrentManifest, isBuildAsset };",
    context,
    { filename: "public/sw.js" },
  );

  function dispatch(type: string, event: WorkerEvent = {}) {
    const waits: Promise<unknown>[] = [];
    event.waitUntil = (promise: Promise<unknown>) => waits.push(Promise.resolve(promise));
    event.respondWith = (promise: Promise<Response>) => {
      event.responsePromise = Promise.resolve(promise);
    };
    listeners.get(type)?.(event);
    return { event, waits };
  }

  const workerContext = context as vm.Context & {
    __workerTest: WorkerHooks;
    indexedDB: { open: ReturnType<typeof vi.fn> };
  };
  return {
    context: workerContext,
    cachesMap,
    cacheStorage,
    calls,
    clients,
    dispatch,
    hooks: workerContext.__workerTest,
  };
}

function navigation(url: string, headers = new Headers()): WorkerRequest {
  return {
    url: new URL(url, ORIGIN).href,
    method: "GET",
    headers,
    mode: "navigate",
    destination: "document",
  };
}

describe("public/sw.js real worker behavior", () => {
  it("does not intercept POST, cross-origin, Authorization, auth, Supabase, or server-function requests", () => {
    const worker = createWorker();
    const requests = [
      {
        url: ORIGIN + "/transactions",
        method: "POST",
        headers: new Headers(),
        mode: "cors",
        destination: "",
      },
      {
        url: "https://cdn.example.com/assets/app-12345678.js",
        method: "GET",
        headers: new Headers(),
        mode: "cors",
        destination: "script",
      },
      {
        url: ORIGIN + "/assets/app-12345678.js",
        method: "GET",
        headers: new Headers({ Authorization: "Bearer token" }),
        mode: "cors",
        destination: "script",
      },
      navigation("/auth"),
      navigation("https://project.supabase.co/rest/v1/ledger_records"),
      navigation("/rest/v1/ledger_records"),
      navigation("/functions/v1/do-work"),
      navigation("/_serverFn/update"),
    ];

    for (const request of requests) {
      const { event } = worker.dispatch("fetch", { request });
      expect(event.responsePromise, request.url).toBeUndefined();
    }
  });

  it("intercepts same-origin navigation and attaches warming to waitUntil without delaying response", async () => {
    let releaseAsset!: () => void;
    const blockedAsset = new Promise<void>((resolve) => {
      releaseAsset = resolve;
    });
    const worker = createWorker({
      fetch: async (input: FetchInput) => {
        const url = typeof input === "string" ? input : input.url;
        if (url === ORIGIN + "/") {
          return new Response('<script type="module" src="/assets/index-12345678.js"></script>', {
            status: 200,
            headers: { "Content-Type": "text/html" },
          });
        }
        if (url.startsWith(ORIGIN + "/assets/")) {
          await blockedAsset;
          return new Response("export const x = 1;", { status: 200 });
        }
        return new Response("route", { status: 200, headers: { "Content-Type": "text/html" } });
      },
    });
    const { event, waits } = worker.dispatch("fetch", { request: navigation("/") });
    const response = await event.responsePromise!;
    expect(response.status).toBe(200);
    expect(waits.length).toBeGreaterThan(0);
    releaseAsset();
    await Promise.all(waits);
  });

  it("never intercepts OAuth callback query parameters and strips query/hash from shell keys", () => {
    const worker = createWorker();
    for (const key of [
      "code",
      "access_token",
      "refresh_token",
      "error",
      "error_description",
      "state",
    ]) {
      const { event } = worker.dispatch("fetch", { request: navigation("/?" + key + "=secret") });
      expect(event.responsePromise).toBeUndefined();
    }
    const key = worker.hooks.navigationCacheKey(new URL(ORIGIN + "/transactions?filter=all#top"));
    expect(key.url).toBe(ORIGIN + "/transactions");
    expect(worker.hooks.hasSensitiveNavigationParams(new URL(ORIGIN + "/?STATE=abc"))).toBe(true);
  });

  it("only cache-first handles assets under the real /assets build directory", () => {
    const worker = createWorker();
    const request = { method: "GET", headers: new Headers(), destination: "image" };
    expect(worker.hooks.isBuildAsset(request, new URL(ORIGIN + "/assets/logo-12345678.svg"))).toBe(
      true,
    );
    expect(worker.hooks.isBuildAsset(request, new URL(ORIGIN + "/favicon.svg"))).toBe(false);
    expect(
      worker.hooks.isBuildAsset(request, new URL("https://cdn.example.com/assets/logo.svg")),
    ).toBe(false);
  });

  it("returns Response.error for a missing lazy asset without replacing the current document", async () => {
    const worker = createWorker({
      fetch: async () => {
        throw new Error("offline");
      },
    });
    const request = {
      url: ORIGIN + "/assets/lazy-route-12345678.js",
      method: "GET",
      headers: new Headers(),
      mode: "cors",
      destination: "script",
    };
    const { event } = worker.dispatch("fetch", { request });
    const response = await event.responsePromise!;
    expect(response.type).toBe("error");
    expect(WORKER_SOURCE).not.toContain("document.body.innerHTML");
  });

  it("re-warms an asset when the manifest exists but CacheStorage has evicted that file", async () => {
    const worker = createWorker();
    const html = '<script type="module" src="/assets/entry-12345678.js"></script>';
    await worker.hooks.warmShellAssets(html, new URL(ORIGIN + "/"));
    const assetCache = await worker.cacheStorage.open("pocketvault-assets-v2");
    await assetCache.delete(ORIGIN + "/assets/entry-12345678.js");
    const callsBefore = worker.calls.fetch.length;
    await worker.hooks.warmShellAssets(html, new URL(ORIGIN + "/"));
    expect(worker.calls.fetch.length).toBeGreaterThan(callsBefore);
    expect(await assetCache.match(ORIGIN + "/assets/entry-12345678.js")).toBeDefined();
  });

  it("caps shell documents at 20 and never evicts the root document", async () => {
    const worker = createWorker();
    const cache = await worker.cacheStorage.open("pocketvault-shell-v2");
    await cache.put(new Request(ORIGIN + "/"), new Response("root"));
    for (let index = 0; index < 25; index += 1) {
      await cache.put(new Request(ORIGIN + "/page-" + index), new Response("page"));
    }
    await worker.hooks.trimShellCache();
    const keys = await cache.keys();
    expect(keys).toHaveLength(20);
    expect(keys.some((key: Request) => new URL(key.url).pathname === "/")).toBe(true);
    expect(keys.some((key: Request) => new URL(key.url).pathname === "/page-0")).toBe(false);
  });

  it("install warms root and activate removes only obsolete PocketVault caches when kill switch is off", async () => {
    const worker = createWorker();
    worker.cachesMap.set("pocketvault-shell-old", new Map());
    worker.cachesMap.set("unrelated-cache", new Map());
    const install = worker.dispatch("install");
    await Promise.all(install.waits);
    expect(worker.cachesMap.has("pocketvault-shell-v2")).toBe(true);
    expect(worker.cachesMap.has("pocketvault-assets-v2")).toBe(true);

    const activate = worker.dispatch("activate");
    await Promise.all(activate.waits);
    expect(worker.cachesMap.has("pocketvault-shell-old")).toBe(false);
    expect(worker.cachesMap.has("pocketvault-shell-v2")).toBe(true);
    expect(worker.cachesMap.has("unrelated-cache")).toBe(true);
    expect(worker.calls.unregister).toBe(0);
    expect(worker.calls.claim).toBe(1);
  });

  it("kill switch immediately skips waiting, unregisters, deletes only PocketVault caches, and never touches IndexedDB", async () => {
    const worker = createWorker({ killSwitch: true });
    worker.cachesMap.set("pocketvault-shell-v2", new Map());
    worker.cachesMap.set("pocketvault-assets-v2", new Map());
    worker.cachesMap.set("unrelated-cache", new Map());

    const install = worker.dispatch("install");
    expect(worker.calls.skipWaiting).toBe(1);
    await Promise.all(install.waits);

    const activate = worker.dispatch("activate");
    await Promise.all(activate.waits);
    expect(worker.calls.unregister).toBe(1);
    expect(worker.calls.claim).toBe(1);
    expect(worker.cachesMap.has("pocketvault-shell-v2")).toBe(false);
    expect(worker.cachesMap.has("pocketvault-assets-v2")).toBe(false);
    expect(worker.cachesMap.has("unrelated-cache")).toBe(true);
    expect(worker.clients[0]!.postMessage).toHaveBeenCalledWith({
      type: "POCKETVAULT_SW_DISABLED",
      version: "v2",
    });
    expect(worker.context.indexedDB.open).not.toHaveBeenCalled();
  });

  it("serves cached navigation at three seconds without aborting the late network request", async () => {
    vi.useFakeTimers();
    try {
      let releaseNavigation!: (response: Response) => void;
      const delayed = new Promise<Response>((resolve) => {
        releaseNavigation = resolve;
      });
      const worker = createWorker({
        fetch: async (input: FetchInput) => {
          const url = typeof input === "string" ? input : input.url;
          if (url === ORIGIN + "/transactions") return delayed;
          if (url === ORIGIN + "/") {
            return new Response('<script type="module" src="/assets/index-12345678.js"></script>', {
              status: 200,
              headers: { "Content-Type": "text/html" },
            });
          }
          return new Response("export const ok = true;", { status: 200 });
        },
      });
      const shell = await worker.cacheStorage.open("pocketvault-shell-v2");
      await shell.put(new Request(ORIGIN + "/"), new Response("cached root"));
      const { event, waits } = worker.dispatch("fetch", { request: navigation("/transactions") });
      await vi.advanceTimersByTimeAsync(3000);
      const fallback = await event.responsePromise!;
      expect(await fallback.text()).toBe("cached root");
      releaseNavigation(
        new Response('<script type="module" src="/assets/index-12345678.js"></script>', {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
      );
      await Promise.all(waits);
      expect(await shell.match(ORIGIN + "/transactions")).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("limits asset warming to four concurrent requests and backs off after failures", async () => {
    let active = 0;
    let maximum = 0;
    let calls = 0;
    const worker = createWorker({
      fetch: async (input: FetchInput) => {
        const url = typeof input === "string" ? input : input.url;
        calls += 1;
        if (url.startsWith(ORIGIN + "/assets/")) {
          active += 1;
          maximum = Math.max(maximum, active);
          await new Promise((resolve) => setTimeout(resolve, 5));
          active -= 1;
          return new Response("export const ok = true;", { status: 200 });
        }
        return new Response("unused", { status: 200 });
      },
    });
    const html = Array.from(
      { length: 9 },
      (_, index) => '<script type="module" src="/assets/chunk-' + index + '-12345678.js"></script>',
    ).join("");
    await worker.hooks.warmShellAssets(html, new URL(ORIGIN + "/"));
    expect(maximum).toBeLessThanOrEqual(4);
    expect(maximum).toBeGreaterThan(1);

    const failing = createWorker({
      fetch: async (input: FetchInput) => {
        const url = typeof input === "string" ? input : input.url;
        if (url.startsWith(ORIGIN + "/assets/")) return new Response("bad", { status: 500 });
        return new Response("unused", { status: 200 });
      },
    });
    const failedHtml = '<script type="module" src="/assets/fail-12345678.js"></script>';
    await expect(
      failing.hooks.warmShellAssets(failedHtml, new URL(ORIGIN + "/")),
    ).rejects.toThrow();
    const callsAfterFailure = failing.calls.fetch.length;
    await expect(
      failing.hooks.warmShellAssets(failedHtml, new URL(ORIGIN + "/")),
    ).rejects.toThrow();
    expect(failing.calls.fetch.length).toBe(callsAfterFailure);
  });
});
