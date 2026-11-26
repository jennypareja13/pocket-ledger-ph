import { describe, expect, it } from "vitest";
import {
  PRIVACY_NOTICE_TEXT,
  PRIVACY_NOTICE_VERSION,
  LOCAL_PRIVACY_CONSENT_VERSION_KEY,
  hasCurrentPrivacyConsent,
} from "@/lib/privacy-notice";
import { buildPasswordResetRedirect } from "@/lib/password-reset-url";
import { isValidPassword, MIN_PASSWORD_LENGTH } from "@/lib/password-validation";

describe("Privacy notice and consent version", () => {
  it("has a version and contains no unresolved confirmation placeholders", () => {
    expect(PRIVACY_NOTICE_VERSION).toMatch(/^\d{4}-\d{2}-v\d+$/);
    expect(PRIVACY_NOTICE_TEXT).not.toContain("[CONFIRM");
    expect(PRIVACY_NOTICE_TEXT).not.toContain("___");
    expect(LOCAL_PRIVACY_CONSENT_VERSION_KEY).toBe("pv-privacy-consent-version");
  });
  it("requires consent again when the notice version changes", () => {
    const currentConsent = hasCurrentPrivacyConsent({
      privacy_consent_version: PRIVACY_NOTICE_VERSION,
    });
    expect(currentConsent).toBe(true);
    expect(hasCurrentPrivacyConsent({})).toBe(false);
    expect(hasCurrentPrivacyConsent({ privacy_consent_version: "older" })).toBe(false);
    expect(hasCurrentPrivacyConsent(null)).toBe(false);
  });
});

describe("password validation", () => {
  it("requires at least eight characters", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(isValidPassword("1234567")).toBe(false);
    expect(isValidPassword("12345678")).toBe(true);
  });
});

describe("password reset redirect", () => {
  it("uses only the fixed reset route on the supplied origin", () => {
    expect(buildPasswordResetRedirect("https://pocket-vault-bnpl.lovable.app")).toBe(
      "https://pocket-vault-bnpl.lovable.app/reset-password",
    );
    expect(buildPasswordResetRedirect("http://localhost:3000")).toBe(
      "http://localhost:3000/reset-password",
    );
  });
  it("rejects insecure origins and cannot accept a user-controlled path", () => {
    expect(() => buildPasswordResetRedirect("http://example.com")).toThrow();
    expect(buildPasswordResetRedirect("https://example.com/evil")).toBe(
      "https://example.com/reset-password",
    );
  });
});
