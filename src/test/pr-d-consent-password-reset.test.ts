import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PRIVACY_NOTICE_TEXT,
  PRIVACY_NOTICE_VERSION,
  LOCAL_PRIVACY_CONSENT_VERSION_KEY,
  hasCurrentPrivacyConsent,
} from "@/lib/privacy-notice";
import {
  decideResetPageState,
  isRecoveryMarkerFresh,
  makeRecoveryMarker,
  consentCacheKey,
  consentDeclineSignOutOptions,
  decideConsentGate,
  PASSWORD_RECOVERY_MARKER_KEY,
  passwordResetRequestErrorMessage,
  readLastConsentCache,
  recoveryMarkerFromUrl,
  shouldClearLedgerOnConsentDecline,
  writeConsentCache,
} from "@/lib/privacy-consent";
import { buildPasswordResetRedirect } from "@/lib/password-reset-url";
import { isValidPassword, MIN_PASSWORD_LENGTH } from "@/lib/password-validation";
const noticeHashes: Record<string, string> = {
  "2026-11-v1": "8482ddbf76f8bf5bd370106a87cb42c4c1564ccd39a0206da22ac1ad880d3c73",
};
function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}
describe("Privacy notice", () => {
  it("has no placeholders and pins text hash to version", () => {
    expect(PRIVACY_NOTICE_TEXT).not.toContain("[CONFIRM");
    expect(PRIVACY_NOTICE_TEXT).not.toContain("___");
    expect(LOCAL_PRIVACY_CONSENT_VERSION_KEY).toBe("pv-privacy-consent-version");
    expect(noticeHashes[PRIVACY_NOTICE_VERSION]).toBe(
      createHash("sha256").update(PRIVACY_NOTICE_TEXT).digest("hex"),
    );
  });
  it("checks the current consent version", () => {
    expect(hasCurrentPrivacyConsent({ privacy_consent_version: PRIVACY_NOTICE_VERSION })).toBe(
      true,
    );
    expect(hasCurrentPrivacyConsent({})).toBe(false);
    expect(hasCurrentPrivacyConsent({ privacy_consent_version: "old" })).toBe(false);
    expect(hasCurrentPrivacyConsent(null)).toBe(false);
  });
});
describe("Consent decision and cache", () => {
  it("stores and reads a user-bound cache", () => {
    const storage = memoryStorage();
    writeConsentCache(storage, "u1");
    expect(readLastConsentCache(storage)).toEqual({
      userId: "u1",
      version: PRIVACY_NOTICE_VERSION,
    });
    expect(consentCacheKey("u1")).toBe("pv-privacy-consent:u1");
  });
  it("requires consent for an existing account with no metadata or cache", () => {
    expect(
      decideConsentGate({
        session: { user: { id: "u1", user_metadata: {} } },
        guestFlag: false,
        guestConsent: false,
        cachedConsent: null,
        timedOut: false,
      }),
    ).toBe("required");
  });
  it("accepts current metadata and a matching local cache", () => {
    expect(
      decideConsentGate({
        session: {
          user: { id: "u1", user_metadata: { privacy_consent_version: PRIVACY_NOTICE_VERSION } },
        },
        guestFlag: false,
        guestConsent: false,
        cachedConsent: null,
        timedOut: false,
      }),
    ).toBe("accepted");
    expect(
      decideConsentGate({
        session: { user: { id: "u1", user_metadata: { privacy_consent_version: "old" } } },
        guestFlag: false,
        guestConsent: false,
        cachedConsent: { userId: "u1", version: PRIVACY_NOTICE_VERSION },
        timedOut: false,
      }),
    ).toBe("accepted");
  });
  it("requires consent on another device if metadata is stale and no cache exists", () => {
    expect(
      decideConsentGate({
        session: { user: { id: "u1", user_metadata: { privacy_consent_version: "old" } } },
        guestFlag: false,
        guestConsent: false,
        cachedConsent: null,
        timedOut: false,
      }),
    ).toBe("required");
  });
  it("does not reuse another account's cached consent", () => {
    expect(
      decideConsentGate({
        session: { user: { id: "u2", user_metadata: { privacy_consent_version: "old" } } },
        guestFlag: false,
        guestConsent: false,
        cachedConsent: { userId: "u1", version: PRIVACY_NOTICE_VERSION },
        timedOut: false,
      }),
    ).toBe("required");
  });
  it("covers guest consent and no guest consent", () => {
    expect(
      decideConsentGate({
        session: null,
        guestFlag: true,
        guestConsent: true,
        cachedConsent: null,
        timedOut: false,
      }),
    ).toBe("accepted");
    expect(
      decideConsentGate({
        session: null,
        guestFlag: true,
        guestConsent: false,
        cachedConsent: null,
        timedOut: false,
      }),
    ).toBe("required-guest");
  });
  it("uses a current last-known cache after timeout, otherwise waits", () => {
    expect(
      decideConsentGate({
        session: null,
        guestFlag: false,
        guestConsent: false,
        cachedConsent: { userId: "u1", version: PRIVACY_NOTICE_VERSION },
        timedOut: true,
      }),
    ).toBe("accepted");
    expect(
      decideConsentGate({
        session: null,
        guestFlag: false,
        guestConsent: false,
        cachedConsent: null,
        timedOut: true,
      }),
    ).toBe("loading");
    expect(
      decideConsentGate({
        session: null,
        guestFlag: false,
        guestConsent: false,
        cachedConsent: { userId: "u1", version: "older" },
        timedOut: true,
      }),
    ).toBe("loading");
    expect(
      decideConsentGate({
        session: null,
        guestFlag: false,
        guestConsent: false,
        cachedConsent: null,
        timedOut: false,
      }),
    ).toBe("guest");
  });
  it("declines with local-only sign-out and no ledger deletion", () => {
    expect(consentDeclineSignOutOptions()).toEqual({ scope: "local" });
    expect(shouldClearLedgerOnConsentDecline()).toBe(false);
  });

  it("keeps the decline handler away from IndexedDB and ledger deletion APIs", () => {
    const gate = readFileSync("src/components/app/PrivacyConsentGate.tsx", "utf8");
    expect(gate).toContain("supabase.auth.signOut(consentDeclineSignOutOptions())");
    expect(gate).not.toMatch(
      /indexedDB|deleteDatabase|clearLedger|store\.|idbPersistence|supabase\.from/i,
    );
  });
});
describe("Password recovery marker", () => {
  it("detects implicit recovery hashes and PKCE code", () => {
    expect(
      recoveryMarkerFromUrl({ hash: "#access_token=a&refresh_token=r&type=recovery", search: "" }),
    ).toBe("implicit");
    expect(recoveryMarkerFromUrl({ hash: "", search: "?code=pkce-code" })).toBe("pkce");
    expect(recoveryMarkerFromUrl({ hash: "", search: "" })).toBe(null);
    expect(
      recoveryMarkerFromUrl({
        hash: "#error=access_denied&error_code=otp_expired",
        search: "",
      }),
    ).toBe(null);
  });
  it("stores a typed marker with a timestamp and enforces the 60-minute TTL", () => {
    const raw = makeRecoveryMarker("implicit", 1_000);
    expect(JSON.parse(raw)).toEqual({ kind: "implicit", at: 1_000 });
    expect(isRecoveryMarkerFresh(raw, 1_000 + 60 * 60 * 1000)).toBe(true);
    expect(isRecoveryMarkerFresh(raw, 1_000 + 60 * 60 * 1000 + 1)).toBe(false);
    expect(isRecoveryMarkerFresh("not-json", 1_001)).toBe(false);
    expect(PASSWORD_RECOVERY_MARKER_KEY).toBe("pv-password-recovery-marker");
  });
  it("shows the form after a reload when the URL hash is gone but marker and session remain", () => {
    const marker = makeRecoveryMarker("implicit", 10_000);
    expect(decideResetPageState({ sessionUserId: "u1", marker, now: 10_001 })).toBe("form");
  });
  it("ignores stale markers and shows an ordinary session", () => {
    const marker = makeRecoveryMarker("pkce", 1_000);
    expect(decideResetPageState({ sessionUserId: "u1", marker, now: 3_601_001 })).toBe(
      "ordinary-session",
    );
  });
  it("returns invalid-link without a session and ordinary-session without a marker", () => {
    const marker = makeRecoveryMarker("event", 10_000);
    expect(decideResetPageState({ sessionUserId: null, marker, now: 10_001 })).toBe("invalid-link");
    expect(decideResetPageState({ sessionUserId: "u1", marker: null, now: 10_001 })).toBe(
      "ordinary-session",
    );
    expect(decideResetPageState({ sessionUserId: undefined, marker, now: 10_001 })).toBe(
      "checking",
    );
  });
  it("preserves a fresh recovery marker across the shell redirect to /reset-password", () => {
    const shell = readFileSync("src/routes/_shell.tsx", "utf8");
    expect(shell).toContain("isRecoveryMarkerFresh(recoveryMarker)");
    expect(shell).toContain('window.location.replace("/reset-password")');
    expect(shell).not.toMatch(
      /removeItem\(PASSWORD_RECOVERY_MARKER_KEY\)[\s\S]*?window\.location\.replace/,
    );
  });
  it("maps request errors generically and identifies rate limits", () => {
    expect(passwordResetRequestErrorMessage(new Error("offline"))).toContain("internet connection");
    expect(passwordResetRequestErrorMessage({ status: 429, message: "rate limit" })).toContain(
      "Too many",
    );
  });
});
describe("Route verification", () => {
  const script = readFileSync("scripts/verify-offline-build.mjs", "utf8");
  it("checks reset-password in the production route manifest", () => {
    expect(script).toContain('"/reset-password"');
  });
  it("checks privacy-notice in the production route manifest", () => {
    expect(script).toContain('"/privacy-notice"');
  });
  it("preserves email confirmation redirect and consent metadata on signup", () => {
    const auth = readFileSync("src/routes/auth.tsx", "utf8");
    expect(auth).toContain("emailRedirectTo: window.location.origin");
    expect(auth).toContain("privacy_consent_version: PRIVACY_NOTICE_VERSION");
    expect(auth).toContain("privacy_consent_at: new Date().toISOString()");
  });
  it("redirects recovery sessions away from the app shell before AppProvider mounts", () => {
    const shell = readFileSync("src/routes/_shell.tsx", "utf8");
    expect(shell).toContain("sessionStorage.getItem(PASSWORD_RECOVERY_MARKER_KEY)");
    expect(shell.indexOf("sessionStorage.getItem(PASSWORD_RECOVERY_MARKER_KEY)")).toBeLessThan(
      shell.indexOf("<AppProvider>"),
    );
  });
});
describe("Password validation and redirect", () => {
  it("requires eight characters", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(isValidPassword("1234567")).toBe(false);
    expect(isValidPassword("12345678")).toBe(true);
  });
  it("builds a fixed redirect for secure origins", () => {
    expect(buildPasswordResetRedirect("https://pocket-vault-bnpl.lovable.app")).toBe(
      "https://pocket-vault-bnpl.lovable.app/reset-password",
    );
    expect(buildPasswordResetRedirect("http://localhost:3000")).toBe(
      "http://localhost:3000/reset-password",
    );
    expect(() => buildPasswordResetRedirect("http://example.com")).toThrow();
    expect(buildPasswordResetRedirect("https://example.com/evil")).toBe(
      "https://example.com/reset-password",
    );
  });
});
