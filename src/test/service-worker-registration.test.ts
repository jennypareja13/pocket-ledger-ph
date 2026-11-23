import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getBootFingerprint,
  getOfflineQueryAction,
  hasRunningAppUpdate,
  isOfflineOptedIn,
  shouldRegisterServiceWorker,
  SERVICE_WORKER_VERSION,
} from "@/lib/service-worker";

const ORIGIN = "https://pocket-vault-bnpl.lovable.app";

describe("PocketVault offline opt-in and update fingerprint", () => {
  it("defaults to OFF and requires an explicit local opt-in", () => {
    expect(isOfflineOptedIn(null)).toBe(false);
    expect(isOfflineOptedIn("false")).toBe(false);
    expect(isOfflineOptedIn("true")).toBe(true);
    const base = {
      production: true,
      topLevel: true,
      secureContext: true,
      hostname: "pocket-vault-bnpl.lovable.app",
    };
    expect(shouldRegisterServiceWorker({ ...base, optedIn: false })).toBe(false);
    expect(shouldRegisterServiceWorker({ ...base, optedIn: true })).toBe(true);
    expect(shouldRegisterServiceWorker({ ...base, optedIn: true, production: false })).toBe(false);
    expect(shouldRegisterServiceWorker({ ...base, optedIn: true, topLevel: false })).toBe(false);
    expect(shouldRegisterServiceWorker({ ...base, optedIn: true, secureContext: false })).toBe(false);
    expect(shouldRegisterServiceWorker({
      ...base, optedIn: true, hostname: "id-preview--abc.lovable.app",
    })).toBe(false);
  });

  it("recognizes only offline=1 and offline=0 and leaves other query strings alone", () => {
    expect(getOfflineQueryAction("?offline=1")).toBe("enable");
    expect(getOfflineQueryAction("?keep=yes&offline=0")).toBe("disable");
    expect(getOfflineQueryAction("?offline=true")).toBeNull();
    expect(getOfflineQueryAction("?other=1")).toBeNull();
  });

  it("fingerprints only the entry module, ignoring per-route modulepreload differences", () => {
    const root = '<link rel="modulepreload" href="/assets/home-route-11111111.js"><script type="module" src="/assets/index-12345678.js"></script>';
    const bnpl = '<link rel="modulepreload" href="/assets/bnpl-route-22222222.js"><script type="module" src="/assets/index-12345678.js"></script>';
    const auth = '<link rel="modulepreload" href="/assets/auth-route-33333333.js"><script type="module" src="/assets/index-12345678.js"></script>';
    const transactions = '<link rel="modulepreload" href="/assets/transactions-route-44444444.js"><script type="module" src="/assets/index-12345678.js"></script>';
    const fingerprint = getBootFingerprint(root, ORIGIN);
    expect(fingerprint).toBe("/assets/index-12345678.js");
    expect(getBootFingerprint(bnpl, ORIGIN)).toBe(fingerprint);
    expect(getBootFingerprint(auth, ORIGIN)).toBe(fingerprint);
    expect(getBootFingerprint(transactions, ORIGIN)).toBe(fingerprint);
    expect(hasRunningAppUpdate(fingerprint, getBootFingerprint(
      '<script type="module" src="/assets/index-87654321.js"></script>', ORIGIN,
    ))).toBe(true);
    expect(hasRunningAppUpdate(fingerprint, fingerprint)).toBe(false);
  });

  it("keeps the TypeScript shutdown version aligned with the real worker cache version", () => {
    const worker = readFileSync(resolve(process.cwd(), "public/sw.js"), "utf8");
    expect(worker.match(/const CACHE_VERSION = "([^"]+)"/)?.[1]).toBe(SERVICE_WORKER_VERSION);
  });
});
