export const PRIVACY_NOTICE_VERSION = "2026-11-v1";

export const PRIVACY_NOTICE_TITLE = "PocketVault Privacy Notice";
export const LOCAL_PRIVACY_CONSENT_VERSION_KEY = "pv-privacy-consent-version";
export const LOCAL_PRIVACY_CONSENT_AT_KEY = "pv-privacy-consent-at";

export const PRIVACY_NOTICE_TEXT = `PocketVault Privacy Notice
Version: ${PRIVACY_NOTICE_VERSION}

PocketVault is an app developed by Jenny Pareja as part of a BSBA Marketing Management thesis at Cebu Technological University, Main Campus, Cebu City. The thesis studies Buy Now, Pay Later (BNPL) use and financial strain.

The app collects information so it can work. This may include your account email and display name, transactions, accounts, budgets, BNPL entries, and feedback you choose to send.

Only survey responses and submitted feedback are analyzed for the thesis. Entries you type into PocketVault during testing are not analyzed, quoted, or published. They are used only to make the app work.

Your account and app data are stored in Supabase through Lovable Cloud. Some app data is also stored in your browser or installed app on your device. This local data may remain after you sign out.

Jenny Pareja is the only person with technical access to the project's database. Lovable and Supabase provide and operate the hosting infrastructure.

Taking part is voluntary. You may choose not to use the app. During testing, please use fake or rounded amounts instead of your real financial information.

Your cloud data will be deleted within 30 days after the thesis is approved or defended, or earlier if you ask for deletion. To request deletion or ask a privacy question, email jennypareja143@gmail.com. Your account and cloud data will be deleted within 14 days after your request, and you will receive an email confirmation.

Data stored on your own device is not deleted by that request. To remove it, clear PocketVault's site data in your browser settings, such as Chrome Settings, or uninstall the installed app.

This notice will be reviewed by the thesis adviser before PocketVault is published. It is not legal advice and does not by itself establish compliance with the Philippine Data Privacy Act (RA 10173). It does not replace any informed-consent form required by the university or adviser.`;

export function hasCurrentPrivacyConsent(
  userMetadata: Record<string, unknown> | null | undefined,
): boolean {
  return userMetadata?.["privacy_consent_version"] === PRIVACY_NOTICE_VERSION;
}
