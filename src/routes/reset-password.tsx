import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/app/bits";
import { APP_NAME } from "@/lib/config";
import { isValidPassword } from "@/lib/password-validation";

export const Route = createFileRoute("/reset-password" as never)({
  ssr: false,
  head: () => ({ meta: [{ title: `Reset password — ${APP_NAME}` }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setReady(Boolean(data.session));
        setEmail(data.session?.user.email ?? "");
      }
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" && session) {
        setReady(true);
        setEmail(session.user.email ?? "");
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    if (!isValidPassword(password)) {
      return setError("Password must be at least 8 characters.");
    }
    if (password !== confirm) {
      return setError("The passwords do not match.");
    }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      return setError("This reset link may have expired. Request a new password reset link.");
    }
    setMessage("Your password has been updated. You can now sign in.");
    await supabase.auth.signOut();
    window.setTimeout(() => nav({ to: "/auth" }), 1200);
  }

  async function resend() {
    setBusy(true);
    setError(undefined);
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/reset-password",
    });
    setBusy(false);
    setMessage(
      "If an account matches that email, a password reset link will be sent. Check your inbox.",
    );
    setCooldown(true);
    window.setTimeout(() => setCooldown(false), 60_000);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4 py-8">
      <h1 className="font-display text-2xl font-semibold">Set a new password</h1>
      {!ready ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            This reset link is invalid or has expired. Request a new link to continue.
          </p>
          <Field label="Email" htmlFor="reset-email">
            <Input
              id="reset-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          {message && (
            <p role="status" className="text-sm">
              {message}
            </p>
          )}
          <Button onClick={resend} disabled={busy || cooldown || !email.trim()}>
            {cooldown ? "Please wait before requesting another link" : "Send a new reset link"}
          </Button>
          <Button variant="outline" onClick={() => nav({ to: "/auth" })}>
            Back to sign in
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="New password (at least 8 characters)" htmlFor="new-password">
            <Input
              id="new-password"
              type="password"
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <Field label="Confirm new password" htmlFor="confirm-password">
            <Input
              id="confirm-password"
              type="password"
              minLength={8}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="text-sm">
              {message}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            Update password
          </Button>
        </form>
      )}
    </main>
  );
}
