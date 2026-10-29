import { createFileRoute, Link, Navigate, Outlet, useLocation } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import {
  ArrowLeftRight, BarChart3, HandCoins, Layers, LayoutDashboard, Menu, PiggyBank, Plus, Settings, Wallet,
} from "lucide-react";
import { AppProvider, useApp, useSpace } from "@/components/app/AppProvider";
import { TxDialog } from "@/components/app/TxDialog";
import { SyncBadge } from "@/components/app/SyncBadge";
import { Field, Select, Spinner } from "@/components/app/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/config";
import { createAccount, createSpace } from "@/lib/actions";
import { parseAmount } from "@/lib/money";
import { ACCOUNT_TYPES } from "@/lib/labels";
import type { AccountType } from "@/lib/types";

export const Route = createFileRoute("/_shell")({
  ssr: false,
  component: ShellRoute,
});

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { to: "/accounts", label: "Accounts", icon: Wallet },
  { to: "/budgets", label: "Budgets", icon: PiggyBank },
  { to: "/loans", label: "Owed to me", icon: HandCoins },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/spaces", label: "Spaces & categories", icon: Layers },
  { to: "/settings", label: "Settings & sync", icon: Settings },
] as const;
const MOBILE = ["/", "/transactions", "/loans", "/reports"];

function ShellRoute() {
  return (
    <AppProvider>
      <Gate />
    </AppProvider>
  );
}

function Gate() {
  const { auth, store, loadError, snap, online, sync } = useApp();
  if (auth.status === "loading") return <Spinner />;
  if (auth.status === "signed_out") return <Navigate to="/auth" replace />;
  if (loadError) return <p className="p-8 text-destructive">Could not open on-device storage: {loadError}</p>;
  if (!store) return <Spinner label="Opening your ledger…" />;
  const activeSpaces = snap.spaces.filter((s) => !s.data.archived);
  if (activeSpaces.length === 0) {
    // Wait for the first download so a second device doesn't create a duplicate space.
    if (auth.status === "signed_in" && online && !sync.initialDone) return <Spinner label="Fetching your data…" />;
    return <Onboarding />;
  }
  return <Layout />;
}

function SpacePicker({ className }: { className?: string }) {
  const { snap, spaceId, setSpaceId } = useApp();
  const spaces = snap.spaces.filter((s) => !s.data.archived);
  return (
    <div className={className}>
      <label htmlFor="space-pick" className="sr-only">Financial space</label>
      <Select id="space-pick" value={spaceId ?? ""} onChange={(e) => setSpaceId(e.target.value)} className="h-9 font-medium">
        {spaces.map((s) => (
          <option key={s.id} value={s.id}>{s.data.name}{s.data.type === "managed" ? " (managed fund)" : ""}</option>
        ))}
      </Select>
    </div>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const loc = useLocation();
  return (
    <nav className="space-y-0.5" aria-label="Main">
      {NAV.map(({ to, label, icon: Icon }) => {
        const active = to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(to);
        return (
          <Link key={to} to={to} onClick={onNavigate}
            className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60")}>
            <Icon className="size-4" /> {label}
          </Link>
        );
      })}
    </nav>
  );
}

function Layout() {
  const { openTx } = useApp();
  const { space } = useSpace();
  const loc = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  return (
    <div className="min-h-screen md:grid md:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r bg-sidebar p-4 md:flex">
        <Link to="/" className="mb-6 flex items-center gap-2 px-2">
          <span className="grid size-8 place-items-center rounded-lg bg-primary font-display text-primary-foreground">₱</span>
          <span className="font-display text-lg">{APP_NAME}</span>
        </Link>
        <SpacePicker className="mb-4" />
        <NavLinks />
        <div className="mt-auto space-y-3">
          <Button className="w-full" onClick={() => openTx()}><Plus /> Add transaction</Button>
          <SyncBadge className="w-full justify-center" />
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b bg-background/90 px-4 py-3 backdrop-blur md:hidden">
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary font-display text-sm text-primary-foreground">₱</span>
          <SpacePicker className="min-w-0 flex-1" />
          <SyncBadge />
        </header>
        {space?.data.type === "managed" && (
          <div className="border-b bg-managed-soft px-4 py-2 text-center text-xs font-medium text-managed md:px-8">
            Managed fund — money here is held for others and is not part of your personal balance.
          </div>
        )}
        <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 md:px-8 md:pb-12">
          <Outlet />
        </main>
      </div>

      <button type="button" aria-label="Add transaction" onClick={() => openTx()}
        className="fixed bottom-20 right-4 z-30 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-soft md:hidden">
        <Plus className="size-6" />
      </button>
      <nav aria-label="Mobile" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden">
        {NAV.filter((n) => MOBILE.includes(n.to)).map(({ to, label, icon: Icon }) => {
          const active = to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(to);
          return (
            <Link key={to} to={to} className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", active ? "text-primary" : "text-muted-foreground")}>
              <Icon className="size-5" />{label === "Transactions" ? "Activity" : label === "Dashboard" ? "Home" : label}
            </Link>
          );
        })}
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger className="flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground">
            <Menu className="size-5" />More
          </SheetTrigger>
          <SheetContent side="bottom" className="bg-sidebar">
            <SheetHeader><SheetTitle>{APP_NAME}</SheetTitle></SheetHeader>
            <div className="px-2 pb-6"><NavLinks onNavigate={() => setMoreOpen(false)} /></div>
          </SheetContent>
        </Sheet>
      </nav>
      <TxDialog />
    </div>
  );
}

function Onboarding() {
  const { store, setSpaceId, auth } = useApp();
  const [name, setName] = useState("My Personal Money");
  const [acc, setAcc] = useState("Cash");
  const [type, setType] = useState<AccountType>("cash");
  const [opening, setOpening] = useState("");
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!store) return;
    const o = opening.trim() ? parseAmount(opening) : 0;
    if (o === null) return setErr("Enter a valid starting balance, e.g. 5,000.00");
    if (!name.trim() || !acc.trim()) return setErr("Please fill in both names.");
    setBusy(true);
    const id = await createSpace(store, name, "personal");
    await createAccount(store, id, acc, type, o);
    setSpaceId(id);
  }
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <form onSubmit={submit} className="w-full max-w-md space-y-5 rounded-2xl border bg-card p-6 shadow-soft">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Welcome to {APP_NAME}</p>
          <h1 className="mt-1 font-display text-2xl">Set up your first space</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A space keeps its own accounts, budgets and reports. You can add separate spaces for sinking funds or money you manage for others later.
            {auth.status === "guest" && " You're using device-only mode."}
          </p>
        </div>
        <Field label="Space name" htmlFor="ob-space"><Input id="ob-space" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First account" htmlFor="ob-acc"><Input id="ob-acc" value={acc} onChange={(e) => setAcc(e.target.value)} /></Field>
          <Field label="Type" htmlFor="ob-type">
            <Select id="ob-type" value={type} onChange={(e) => setType(e.target.value as AccountType)}>
              {ACCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Current balance (₱)" htmlFor="ob-open" hint="Recorded as an opening balance adjustment.">
          <Input id="ob-open" inputMode="decimal" placeholder="0.00" value={opening} onChange={(e) => setOpening(e.target.value)} className="num" />
        </Field>
        {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Setting up…" : "Start tracking"}</Button>
      </form>
    </div>
  );
}
