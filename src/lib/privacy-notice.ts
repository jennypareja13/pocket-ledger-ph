export const PRIVACY_NOTICE_VERSION = "2026-11-v2";
export const PRIVACY_NOTICE_TITLE = "PocketVault Privacy Notice";
export const LOCAL_PRIVACY_CONSENT_VERSION_KEY = "pv-privacy-consent-version";
export const LOCAL_PRIVACY_CONSENT_AT_KEY = "pv-privacy-consent-at";
export const PRIVACY_NOTICE_TEXT = `PocketVault Privacy Notice
Version: ${PRIVACY_NOTICE_VERSION}

PocketVault is an app developed by Jenny Pareja as part of a BSBA Marketing Management thesis at Cebu Technological University, Main Campus, Cebu City. The thesis studies Buy Now, Pay Later (BNPL) use and financial strain. The thesis survey is finished. PocketVault is still being improved based on its results.

What we store: To make the app work, PocketVault stores your account email and display name, and the transactions, accounts, budgets, and BNPL entries you type in.

How we use it: We use your entries only to make the app work for you. We do not sell your data. If we ever want to use your data for something new, such as research or marketing, we will tell you first and ask for your consent again.

Where it is stored: Your account and app data are stored in Supabase through Lovable Cloud. Some app data is also stored in your browser or installed app on your device. This local data may remain after you sign out.

Who can see it: Other members cannot see your data. Jenny Pareja is the only person with technical access to the project's database. Lovable and Supabase provide and operate the hosting infrastructure.

Taking part is voluntary. You may choose not to use the app. While PocketVault is still in development, please use fake or rounded amounts instead of your real financial information.

Keeping and deleting your data: We keep your data while your account is active. You can ask us to delete your account and cloud data at any time. To do that, or to ask a privacy question, email jennypareja143@gmail.com. We will delete your account and cloud data within 14 days and send you an email confirmation.

Data stored on your own device is not deleted by that request. To remove it, clear PocketVault's site data in your browser settings, such as Chrome Settings, or uninstall the installed app.

If anything in this notice is unclear, email the contact above before you use the app.`;
export function hasCurrentPrivacyConsent(
  userMetadata: Record<string, unknown> | null | undefined,
): boolean {
  return userMetadata?.["privacy_consent_version"] === PRIVACY_NOTICE_VERSION;
}
