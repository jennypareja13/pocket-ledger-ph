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
  canUsePasswordRecovery,
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
        cachedConsent: null,
        timedOut: false,
      }),
    ).toBe("guest");
  });
  it("declines with local-only sign-out and no ledger deletion", () => {
    expect(consentDeclineSignOutOptions()).toEqual({ scope: "local" });
    expect(shouldClearLedgerOnConsentDecline()).toBe(false);
  });
});
describe("Password recovery marker", () => {
  it("detects implicit recovery hashes and PKCE code", () => {
    expect(
      recoveryMarkerFromUrl({ hash: "#access_token=a&refresh_token=r&type=recovery", search: "" }),
    ).toBe("implicit");
    expect(recoveryMarkerFromUrl({ hash: "", search: "?code=pkce-code" })).toBe("pkce");
    expect(recoveryMarkerFromUrl({ hash: "", search: "" })).toBe(null);
  });
  it("requires both a session and a recovery marker", () => {
    expect(canUsePasswordRecovery({ sessionUserId: "u1", recoveryMarker: "implicit" })).toBe(true);
    expect(canUsePasswordRecovery({ sessionUserId: "u1", recoveryMarker: null })).toBe(false);
    expect(canUsePasswordRecovery({ sessionUserId: null, recoveryMarker: "pkce" })).toBe(false);
    expect(PASSWORD_RECOVERY_MARKER_KEY).toBe("pv-password-recovery-marker");
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
