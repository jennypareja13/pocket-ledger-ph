export const PRIVACY_CONSENT_LAST_USER_KEY = "pv-privacy-last-user";
export const PASSWORD_RECOVERY_MARKER_KEY = "pv-password-recovery-marker";
export interface ConsentCache { userId: string; version: string; }
export interface ConsentSession { user: { id: string; user_metadata?: Record<string, unknown>; }; }
export interface ConsentStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; }
export type ConsentGateDecision = "accepted" | "required" | "required-guest" | "guest" | "loading";
export function consentCacheKey(userId: string): string { return `pv-privacy-consent:${userId}`; }
export function writeConsentCache(storage: ConsentStorage, userId: string, version: string): void {
  storage.setItem(consentCacheKey(userId), JSON.stringify({ userId, version }));
  storage.setItem(PRIVACY_CONSENT_LAST_USER_KEY, userId);
}
export function readLastConsentCache(storage: Pick<ConsentStorage, "getItem">): ConsentCache | null {
  const userId = storage.getItem(PRIVACY_CONSENT_LAST_USER_KEY);
  if (!userId) return null;
  const raw = storage.getItem(consentCacheKey(userId));
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && "userId" in parsed && "version" in parsed &&
      parsed.userId === userId && typeof parsed.version === "string") return { userId, version: parsed.version };
  } catch { /* A damaged local cache is treated as no cached consent. */ }
  return null;
}
export function decideConsentGate(input: {
  session: ConsentSession | null; guestFlag: boolean; guestConsent: boolean;
  cachedConsent: ConsentCache | null; timedOut: boolean;
}): ConsentGateDecision {
  const { session, guestFlag, guestConsent, cachedConsent, timedOut } = input;
  if (session) {
    if (session.user.user_metadata?.["privacy_consent_version"] === "2026-11-v1") return "accepted";
    if (cachedConsent?.userId === session.user.id && cachedConsent.version === "2026-11-v1") return "accepted";
    return "required";
  }
  if (guestFlag) return guestConsent ? "accepted" : "required-guest";
  if (timedOut && cachedConsent?.version === "2026-11-v1" && Boolean(cachedConsent.userId)) return "accepted";
  return timedOut ? "loading" : "guest";
}
export function consentDeclineSignOutOptions(): { scope: "local" } { return { scope: "local" }; }
export function shouldClearLedgerOnConsentDecline(): false { return false; }
export function recoveryMarkerFromUrl(input: { hash: string; search: string }): "implicit" | "pkce" | null {
  const hash = new URLSearchParams(input.hash.replace(/^#/, ""));
  if (hash.get("type") === "recovery" && hash.has("access_token") && hash.has("refresh_token")) return "implicit";
  const search = new URLSearchParams(input.search.replace(/^\?/, ""));
  return search.has("code") ? "pkce" : null;
}
export function canUsePasswordRecovery(input: { sessionUserId: string | null | undefined; recoveryMarker: string | null | undefined }): boolean {
  return Boolean(input.sessionUserId && input.recoveryMarker);
}
export function passwordResetRequestErrorMessage(error: unknown): string {
  const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error ?? "");
  const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 0;
  if (status === 429 || /rate.?limit|too many requests|429/i.test(message)) return "Too many reset requests. Please wait before trying again.";
  return "We could not send the email right now. Check your internet connection and try again in a minute.";
}
