import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/app/bits";
import { GUEST_KEY } from "@/components/app/AppProvider";
import { VaultLogo } from "@/components/app/vault-logo";
import { APP_NAME } from "@/lib/config";
import { isValidPassword } from "@/lib/password-validation";
import { buildPasswordResetRedirect } from "@/lib/password-reset-url";
import { PRIVACY_NOTICE_VERSION } from "@/lib/privacy-notice";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: `Sign in — ${APP_NAME}` },
      { name: "description", content: "Sign in to sync your private ledger across devices." },
      { property: "og:title", content: `Sign in — ${APP_NAME}` },
      {
        property: "og:description",
        content: "Sign in to sync your private ledger across devices.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetCooldown, setResetCooldown] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg(undefined);
    if (mode === "up" && (!consent || !isValidPassword(pw))) {
      return setMsg(
        !consent
          ? "Please read and accept the Privacy Notice to create an account."
          : "Password must be at least 8 characters.",
      );
    }
    setBusy(true);
    const r =
      mode === "in"
        ? await supabase.auth.signInWithPassword({ email, password: pw })
        : await supabase.auth.signUp({
            email,
            password: pw,
            options: {
              emailRedirectTo: window.location.origin,
              data: {
                privacy_consent_version: PRIVACY_NOTICE_VERSION,
                privacy_consent_at: new Date().toISOString(),
              },
            },
          });
    setBusy(false);
    if (r.error) return setMsg(r.error.message);
    if (mode === "up" && !r.data.session)
      return setMsg("Check your email to confirm your account, then sign in.");
    localStorage.removeItem(GUEST_KEY);
    nav({ to: "/" });
  }
  async function sendPasswordReset() {
    setBusy(true);
    setMsg(undefined);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: buildPasswordResetRedirect(window.location.origin),
    });
    setBusy(false);
    setResetSent(true);
    setResetCooldown(true);
    window.setTimeout(() => setResetCooldown(false), 60_000);
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (r.error) return setMsg(String(r.error));
    if (!r.redirected) nav({ to: "/" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-4 rounded-2xl border bg-card p-6 shadow-soft"
      >
        <div>
          <h1>
            <VaultLogo />
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode === "in" ? "Sign in to sync your ledger." : "Create your private account."}{" "}
            Sign-in and account recovery need internet. Previously saved records may remain on this
            device while offline.
          </p>
        </div>
        <Field label="Email" htmlFor="a-email">
          <Input
            id="a-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password" htmlFor="a-pw">
          <Input
            id="a-pw"
            type="password"
            minLength={mode === "up" ? 8 : undefined}
            required
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
        </Field>
        {mode === "up" && (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              required
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1"
            />
            <span>
              I have read and agree to the{" "}
              <a
                className="text-primary underline"
                href="/privacy-notice"
                target="_blank"
                rel="noreferrer"
              >
                PocketVault Privacy Notice
              </a>
              .
            </span>
          </label>
        )}
        {mode === "in" && (
          <button
            type="button"
            className="w-full text-left text-sm text-primary underline"
            onClick={() => setForgot(true)}
          >
            Forgot password?
          </button>
        )}
        {forgot && (
          <div className="space-y-2 rounded-xl border p-3">
            <p className="text-sm">
              Enter your email. If an account matches, we will send a reset link.
            </p>
            {resetSent && (
              <p role="status" className="text-sm text-muted-foreground">
                If an account matches that email, a password reset link will be sent. Check your
                inbox.
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={busy || resetCooldown || !email.trim()}
              onClick={sendPasswordReset}
            >
              {resetCooldown ? "Please wait before requesting another link" : "Send reset link"}
            </Button>
            <button type="button" className="text-xs underline" onClick={() => setForgot(false)}>
              Back to sign in
            </button>
          </div>
        )}
        {msg && (
          <p role="alert" className="text-sm text-destructive">
            {msg}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Please wait…" : mode === "in" ? "Sign in" : "Sign up"}
        </Button>
        <Button type="button" variant="outline" className="w-full" onClick={google}>
          Continue with Google
        </Button>
        <button
          type="button"
          className="w-full text-sm text-primary"
          onClick={() => {
            setMode(mode === "in" ? "up" : "in");
            setForgot(false);
            setMsg(undefined);
          }}
        >
          {mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}
        </button>
        <button
          type="button"
          className="w-full text-xs text-muted-foreground underline"
          onClick={() => {
            localStorage.setItem(GUEST_KEY, "1");
            window.location.href = "/";
          }}
        >
          Use on this device only (no sync)
        </button>
      </form>
    </div>
  );
}
