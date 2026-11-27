import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PRIVACY_NOTICE_TEXT, PRIVACY_NOTICE_VERSION, LOCAL_PRIVACY_CONSENT_VERSION_KEY, LOCAL_PRIVACY_CONSENT_AT_KEY } from "@/lib/privacy-notice";
import { GUEST_KEY } from "@/components/app/AppProvider";
import { consentDeclineSignOutOptions, writeConsentCache } from "@/lib/privacy-consent";
export function PrivacyConsentGate({ onAccepted, guestMode = false, userId }: {
  onAccepted: () => void; guestMode?: boolean; userId?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function accept() {
    setBusy(true); setError(undefined);
    if (!guestMode) {
      try {
        const { error: consentError } = await supabase.auth.updateUser({ data: {
          privacy_consent_version: PRIVACY_NOTICE_VERSION, privacy_consent_at: new Date().toISOString(),
        }});
        if (consentError || !userId) {
          setError("We could not save your choice. Connect to the internet and try again.");
          setBusy(false); return;
        }
        writeConsentCache(localStorage, userId, PRIVACY_NOTICE_VERSION);
      } catch {
        setError("We could not save your choice. Connect to the internet and try again.");
        setBusy(false); return;
      }
    } else {
      localStorage.setItem(LOCAL_PRIVACY_CONSENT_VERSION_KEY, PRIVACY_NOTICE_VERSION);
      localStorage.setItem(LOCAL_PRIVACY_CONSENT_AT_KEY, new Date().toISOString());
    }
    setBusy(false); onAccepted();
  }
  async function decline() {
    setBusy(true);
    if (guestMode) localStorage.removeItem(GUEST_KEY);
    else await supabase.auth.signOut(consentDeclineSignOutOptions());
    window.location.replace("/auth");
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 px-4 py-8">
      <h1 className="font-display text-2xl font-semibold">Please read the Privacy Notice</h1>
      <p className="text-sm text-muted-foreground">You must accept this notice before PocketVault opens your ledger. Declining signs you out. It does not delete your account or data.</p>
      <article className="max-h-[55vh] overflow-y-auto whitespace-pre-wrap rounded-xl border bg-card p-4 text-sm leading-6">{PRIVACY_NOTICE_TEXT}</article>
      <p className="text-xs text-muted-foreground">Notice version: {PRIVACY_NOTICE_VERSION}</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button onClick={accept} disabled={busy}>I have read and accept</Button>
      <Button variant="outline" onClick={decline} disabled={busy}>Decline and sign out</Button>
    </main>
  );
}
