import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/app/bits";
import { GUEST_KEY } from "@/components/app/AppProvider";
import { APP_NAME } from "@/lib/config";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: `Sign in — ${APP_NAME}` },
      { name: "description", content: "Sign in to sync your private ledger across devices." },
      { property: "og:title", content: `Sign in — ${APP_NAME}` },
      { property: "og:description", content: "Sign in to sync your private ledger across devices." },
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

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(undefined);
    const r = mode === "in"
      ? await supabase.auth.signInWithPassword({ email, password: pw })
      : await supabase.auth.signUp({ email, password: pw, options: { emailRedirectTo: window.location.origin } });
    setBusy(false);
    if (r.error) return setMsg(r.error.message);
    if (mode === "up" && !r.data.session) return setMsg("Check your email to confirm your account, then sign in.");
    localStorage.removeItem(GUEST_KEY);
    nav({ to: "/" });
  }
  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) return setMsg(String(r.error));
    if (!r.redirected) nav({ to: "/" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border bg-card p-6 shadow-soft">
        <div>
          <h1 className="font-display text-2xl">{APP_NAME}</h1>
          <p className="text-sm text-muted-foreground">{mode === "in" ? "Sign in to sync your ledger." : "Create your private account."} First sign-in needs internet; after that the app works offline.</p>
        </div>
        <Field label="Email" htmlFor="a-email"><Input id="a-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password" htmlFor="a-pw"><Input id="a-pw" type="password" minLength={6} required value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        {msg && <p role="alert" className="text-sm text-destructive">{msg}</p>}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Please wait…" : mode === "in" ? "Sign in" : "Sign up"}</Button>
        <Button type="button" variant="outline" className="w-full" onClick={google}>Continue with Google</Button>
        <button type="button" className="w-full text-sm text-primary" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}
        </button>
        <button type="button" className="w-full text-xs text-muted-foreground underline" onClick={() => { localStorage.setItem(GUEST_KEY, "1"); window.location.href = "/"; }}>
          Use on this device only (no sync)
        </button>
      </form>
    </div>
  );
}
