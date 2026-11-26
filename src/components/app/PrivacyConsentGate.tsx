import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PRIVACY_NOTICE_TEXT, PRIVACY_NOTICE_VERSION } from "@/lib/privacy-notice";

export function PrivacyConsentGate({ onAccepted }: { onAccepted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function accept() {
    setBusy(true);
    setError(undefined);
    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        privacy_consent_version: PRIVACY_NOTICE_VERSION,
        privacy_consent_at: new Date().toISOString(),
      },
    });
    setBusy(false);
    if (updateError) {
      setError("We could not save your choice. Please try again.");
      return;
    }
    onAccepted();
  }

  async function decline() {
    setBusy(true);
    await supabase.auth.signOut();
    window.location.replace("/auth");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 px-4 py-8">
      <h1 className="font-display text-2xl font-semibold">Please read the Privacy Notice</h1>
      <p className="text-sm text-muted-foreground">
        You must accept this notice before PocketVault opens your ledger. Declining signs you out.
        It does not delete your account or data.
      </p>
      <article className="max-h-[55vh] overflow-y-auto whitespace-pre-wrap rounded-xl border bg-card p-4 text-sm leading-6">
        {PRIVACY_NOTICE_TEXT}
      </article>
      <p className="text-xs text-muted-foreground">Notice version: {PRIVACY_NOTICE_VERSION}</p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button onClick={accept} disabled={busy}>
        I have read and accept
      </Button>
      <Button variant="outline" onClick={decline} disabled={busy}>
        Decline and sign out
      </Button>
    </main>
  );
}
