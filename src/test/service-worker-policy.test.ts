import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  chooseNavigationFallback,
  isCacheableRequest,
  isCacheableResponse,
  isPreviewHostname,
  serviceWorkerCacheName,
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

  it("never caches Supabase or server-function endpoint paths", () => {
    for (const path of [
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

  it("uses versioned cache names and bounded navigation fallback order", () => {
    expect(serviceWorkerCacheName("shell", "v1")).toBe("pocketvault-shell-v1");
    expect(chooseNavigationFallback("exact", "root", "offline")).toBe("exact");
    expect(chooseNavigationFallback(undefined, "root", "offline")).toBe("root");
    expect(chooseNavigationFallback(undefined, undefined, "offline")).toBe("offline");
  });

  it("blocks Lovable preview hosts but permits the published PocketVault hostname", () => {
    expect(isPreviewHostname("id-preview--abc123.lovable.app")).toBe(true);
    expect(isPreviewHostname("abc.lovableproject.com")).toBe(true);
    expect(isPreviewHostname("pocket-vault-bnpl.lovable.app")).toBe(false);
    expect(
      shouldRegisterServiceWorker({
        production: true,
        topLevel: true,
        hostname: "pocket-vault-bnpl.lovable.app",
      }),
    ).toBe(true);
    expect(
      shouldRegisterServiceWorker({
        production: false,
        topLevel: true,
        hostname: "pocket-vault-bnpl.lovable.app",
      }),
    ).toBe(false);
    expect(
      shouldRegisterServiceWorker({
        production: true,
        topLevel: false,
        hostname: "pocket-vault-bnpl.lovable.app",
      }),
    ).toBe(false);
  });

  it("keeps the standalone worker guarded against unsafe requests", () => {
    const worker = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
    expect(worker).toContain('request.method.toUpperCase() !== "GET"');
    expect(worker).toContain("url.origin !== self.location.origin");
    expect(worker).toContain('request.headers.has("authorization")');
    expect(worker).toContain("isExcludedPath(url.pathname)");
    expect(worker).toContain("if (!isCacheableRequest(request, url)) return;");
  });
});
