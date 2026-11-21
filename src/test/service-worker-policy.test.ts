import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  hasShellUpdate,
  isCacheableRequest,
  isCacheableResponse,
  isPreviewHostname,
  selectCacheEntriesToEvict,
  serviceWorkerCacheName,
  shellAssetFingerprintSource,
  shouldRegisterServiceWorker,
} from "@/lib/service-worker-policy";

const ORIGIN = "https://pocket-vault-bnpl.lovable.app";
const request = (url: string, method = "GET", headers = new Headers()) =>
  new Request(new URL(url, ORIGIN), { method, headers });

describe("service worker cache policy", () => {
  it("allows only same-origin GET requests without Authorization", () => {
    expect(isCacheableRequest(request("/assets/app-a1b2c3d4.js"), ORIGIN)).toBe(true);
    expect(isCacheableRequest(request("/transactions", "POST"), ORIGIN)).toBe(false);
    expect(isCacheableRequest(request("https://cdn.example.com/app.js"), ORIGIN)).toBe(false);
    expect(
      isCacheableRequest(
        request("/assets/app-a1b2c3d4.js", "GET", new Headers({ Authorization: "Bearer secret" })),
        ORIGIN,
      ),
    ).toBe(false);
  });

  it("never caches auth, Supabase, or server-function endpoint paths", () => {
    for (const path of [
      "/auth",
      "/auth/v1/token",
      "/rest/v1/ledger_records",
      "/storage/v1/object/private",
      "/functions/v1/anything",
      "/realtime/v1/websocket",
      "/api/private",
      "/_serverFn/update",
    ]) {
      expect(isCacheableRequest(request(path), ORIGIN), path).toBe(false);
    }
  });

  it("caches only successful non-opaque responses", () => {
    expect(isCacheableResponse(200)).toBe(true);
    expect(isCacheableResponse(204)).toBe(false);
    expect(isCacheableResponse(404)).toBe(false);
    expect(isCacheableResponse(200, "opaque")).toBe(false);
  });

  it("detects a deployment by comparing fresh shell asset fingerprints", () => {
    const first = shellAssetFingerprintSource(
      '<script type="module" src="/assets/index-old12345.js"></script><link href="/assets/style-old12345.css" rel="stylesheet">',
      ORIGIN,
    );
    const second = shellAssetFingerprintSource(
      '<script type="module" src="/assets/index-new67890.js"></script><link href="/assets/style-new67890.css" rel="stylesheet">',
      ORIGIN,
    );
    expect(first).not.toBeNull();
    expect(second).not.toBe(first);
    expect(hasShellUpdate(first, second)).toBe(true);
    expect(hasShellUpdate(first, first)).toBe(false);
    expect(hasShellUpdate(null, second)).toBe(false);
  });

  it("evicts old deploy assets without evicting current-shell assets across deploys", () => {
    const cache = ["old-a.js", "old-b.js", "deploy-2-a.js", "deploy-2-b.js"];
    const deployTwo = new Set(["deploy-2-a.js", "deploy-2-b.js"]);
    const evictedAfterDeployTwo = selectCacheEntriesToEvict(cache, deployTwo, 3);
    expect(evictedAfterDeployTwo).toEqual(["old-a.js"]);
    const afterDeployTwo = cache.filter((entry) => !evictedAfterDeployTwo.includes(entry));
    expect(afterDeployTwo).toEqual(["old-b.js", "deploy-2-a.js", "deploy-2-b.js"]);

    const deployThree = new Set(["deploy-3-a.js", "deploy-3-b.js"]);
    const afterDeployThree = [
      ...afterDeployTwo,
      "deploy-3-a.js",
      "deploy-3-b.js",
    ];
    const evictedAfterDeployThree = selectCacheEntriesToEvict(
      afterDeployThree,
      deployThree,
      3,
    );
    const retainedAfterDeployThree = afterDeployThree.filter(
      (entry) => !evictedAfterDeployThree.includes(entry),
    );
    expect(evictedAfterDeployThree).toEqual(["old-b.js", "deploy-2-a.js"]);
    expect(retainedAfterDeployThree).toEqual(["deploy-2-b.js", "deploy-3-a.js", "deploy-3-b.js"]);
  });

  it("requires production, top-level, secure context, and a non-preview hostname", () => {
    const allowed = {
      production: true,
      topLevel: true,
      secureContext: true,
      hostname: "pocket-vault-bnpl.lovable.app",
    };
    expect(shouldRegisterServiceWorker(allowed)).toBe(true);
    expect(shouldRegisterServiceWorker({ ...allowed, production: false })).toBe(false);
    expect(shouldRegisterServiceWorker({ ...allowed, topLevel: false })).toBe(false);
    expect(shouldRegisterServiceWorker({ ...allowed, secureContext: false })).toBe(false);
    expect(
      shouldRegisterServiceWorker({ ...allowed, hostname: "id-preview--abc123.lovable.app" }),
    ).toBe(false);
    expect(isPreviewHostname("abc.lovableproject.com")).toBe(true);
    expect(isPreviewHostname("abc.lovable.dev")).toBe(true);
  });

  it("keeps unsafe requests excluded and has safe worker failure/kill-switch paths", () => {
    const worker = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8");
    expect(worker).toContain('request.method.toUpperCase() !== "GET"');
    expect(worker).toContain("url.origin !== self.location.origin");
    expect(worker).toContain('request.headers.has("authorization")');
    expect(worker).toContain("isExcludedPath(url.pathname)");
    expect(worker).toContain("if (!isCacheableRequest(request, url)) return;");
    expect(worker).toContain("catch {");
    expect(worker).toContain("await trimAssetCache(new Set(previous.assets || []))");
    expect(worker).toContain("Your saved records are safe on this device.");
    expect(worker).toContain('onclick="location.reload()"');
    expect(worker).toContain("await self.registration.unregister()");
    expect(worker).toContain("names.filter((name) => name.startsWith(CACHE_PREFIX))");
    expect(worker).not.toContain("indexedDB");
  });
});
