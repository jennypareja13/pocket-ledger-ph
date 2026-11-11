import { createFileRoute, Link, Navigate, Outlet, useLocation } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import {
  ArrowLeftRight,
  BarChart3,
  CalendarClock,
  HandCoins,
  Layers,
  LayoutDashboard,
  Menu,
  PiggyBank,
  Plus,
  Settings,
  Wallet,
} from "lucide-react";
import { AppProvider, useApp, useSpace } from "@/components/app/AppProvider";
import { TxDialog } from "@/components/app/TxDialog";
import { SyncBadge } from "@/components/app/SyncBadge";
import { Field, Select, Spinner } from "@/components/app/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { VaultLogo } from "@/components/app/vault-logo";
import { mainSpaces } from "@/lib/selectors";
import { APP_NAME } from "@/lib/config";
import { createAccount, createSpace } from "@/lib/actions";
import { parseAmount } from "@/lib/money";
import { ACCOUNT_TYPES } from "@/lib/labels";
import { decideEmptyLedgerScreen } from "@/lib/empty-ledger-screen";
import { bnplEnabled } from "@/lib/bnpl-actions";
import type { AccountType } from "@/lib/types";

export const Route = createFileRoute("/_shell")({
  ssr: false,
  component: ShellRoute,
});

const NAV = [
  { to: "/", label: "Home", icon: LayoutDashboard },
  { to: "/transactions", label: "Activity", icon: ArrowLeftRight },
  { to: "/accounts", label: "Accounts", icon: Wallet },
  { to: "/budgets", label: "Budgets", icon: PiggyBank },
  { to: "/loans", label: "Loans", icon: HandCoins },
  { to: "/analysis", label: "Analysis", icon: BarChart3 },
  { to: "/bnpl", label: "BNPL", icon: CalendarClock },
  { to: "/spaces", label: "Spaces & categories", icon: Layers },
  { to: "/settings", label: "Settings & sync", icon: Settings },
] as const;
const MOBILE = ["/transactions", "/budgets", "/", "/analysis"];

function ShellRoute() {
  return (
    <AppProvider>
      <Gate />
    </AppProvider>
  );
}

function Gate() {
  const { auth, store, loadError, snap, online, sync, syncNow } = useApp();
  if (auth.status === "loading") return <Spinner />;
  if (auth.status === "signed_out") return <Navigate to="/auth" replace />;
  if (loadError)
    return <p className="p-8 text-destructive">Could not open on-device storage: {loadError}</p>;
  if (!store) return <Spinner label="Opening your ledger…" />;
  const existingSpaces = snap.spaces.filter((s) => !s.data.archived);
  if (existingSpaces.length === 0) {
    const screen = decideEmptyLedgerScreen({
      authStatus: auth.status,
      online,
      initialDone: sync.initialDone,
      initialPullOkFlag: sync.initialPullOkFlag === true,
      syncError: sync.error,
      running: sync.running,
      attempted: sync.attempted,
    });
    if (screen === "spinner") return <Spinner label="Fetching your data…" />;
    if (screen === "retry")
      return (
        <div className="mx-auto max-w-md space-y-4 p-8">
          <h1 className="font-display text-2xl">Couldn't load your cloud data</h1>
          <p className="text-sm text-muted-foreground">
            {online
              ? "Please retry before setting up your ledger."
              : "You are offline. Connect to the internet and retry."}
          </p>
          <Button onClick={syncNow} disabled={sync.running}>
            Retry
          </Button>
        </div>
      );
    return <Onboarding />;
  }
  return <Layout />;
}

function SpacePicker({ className }: { className?: string }) {
  const { snap, spaceId, setSpaceId } = useApp();
  const spaces = snap.spaces.filter((s) => !s.data.archived);
  return (
    <div className={className}>
      <label htmlFor="space-pick" className="sr-only">
        Financial space
      </label>
      <Select
        id="space-pick"
        value={spaceId ?? ""}
        onChange={(e) => setSpaceId(e.target.value)}
        className="h-9 font-medium"
      >
        <optgroup label="Main Space">
          {mainSpaces(spaces).map((s) => (
            <option key={s.id} value={s.id}>
              {s.data.name}
            </option>
          ))}
        </optgroup>
        <optgroup label="Managed Sub-spaces">
          {spaces
            .filter((s) => s.data.type === "managed")
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.data.name}
              </option>
            ))}
        </optgroup>
      </Select>
    </div>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const loc = useLocation();
  const { snap } = useApp();
  const { space } = useSpace();
  const showBnpl =
    !!space &&
    mainSpaces(snap.spaces).some((s) => s.id === space.id) &&
    bnplEnabled(snap, space.id);
  return (
    <nav className="space-y-0.5" aria-label="Main">
      {NAV.filter((n) => n.to !== "/bnpl" || showBnpl).map(({ to, label, icon: Icon }) => {
        const active = to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
            onClick={onNavigate}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
              active
                ? "bg-[image:var(--gradient-active)] text-sidebar-accent-foreground shadow-sm ring-1 ring-inset ring-sidebar-border"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60",
            )}
          >
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
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-sidebar-border bg-sidebar/90 p-4 shadow-soft backdrop-blur-xl md:flex">
        <Link to="/" className="mb-6 flex items-center gap-2 px-2">
          <VaultLogo />
        </Link>
        <SpacePicker className="mb-4" />
        <NavLinks />
        <div className="mt-auto space-y-3">
          <Button className="w-full" onClick={() => openTx()}>
            <Plus /> Add transaction
          </Button>
          <SyncBadge className="w-full justify-center" />
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-border/80 bg-card/85 px-4 py-3 shadow-soft backdrop-blur-xl md:hidden">
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <VaultLogo />
            <SyncBadge />
            <SpacePicker className="w-full" />
          </div>
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

      <Button
        type="button"
        aria-label="Add transaction"
        onClick={() => openTx()}
        className="button-primary fixed bottom-20 right-4 z-30 grid size-14 place-items-center rounded-full bg-[image:var(--gradient-primary)] text-primary-foreground shadow-[var(--glow)] hover:scale-[1.03] md:hidden"
      >
        <Plus className="size-6" />
      </Button>
      <nav
        aria-label="Mobile"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border/80 bg-card/90 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_28px_rgb(0_57_66_/_8%)] backdrop-blur-xl md:hidden"
      >
        {MOBILE.flatMap((to) => NAV.filter((n) => n.to === to)).map(({ to, label, icon: Icon }) => {
          const active = to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex min-h-16 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "grid size-8 place-items-center rounded-xl",
                  active && "bg-[image:var(--gradient-active)] shadow-sm",
                )}
              >
                <Icon className="size-5" />
              </span>
              {label}
            </Link>
          );
        })}
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger className="flex min-h-16 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Menu className="size-5" />
            More
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="border-sidebar-border bg-sidebar/95 backdrop-blur-xl"
          >
            <SheetHeader>
              <SheetTitle>{APP_NAME}</SheetTitle>
            </SheetHeader>
            <div className="px-2 pb-6">
              <NavLinks onNavigate={() => setMoreOpen(false)} />
            </div>
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
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-5 rounded-2xl border bg-card p-6 shadow-soft"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            Welcome to {APP_NAME}
          </p>
          <h1 className="mt-1 font-display text-2xl">Set up your first space</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A space keeps its own accounts, budgets and analysis. You can add separate spaces for
            sinking funds or money you manage for others later.
            {auth.status === "guest" && " You're using device-only mode."}
          </p>
        </div>
        <Field label="Space name" htmlFor="ob-space">
          <Input id="ob-space" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First account" htmlFor="ob-acc">
            <Input id="ob-acc" value={acc} onChange={(e) => setAcc(e.target.value)} />
          </Field>
          <Field label="Type" htmlFor="ob-type">
            <Select
              id="ob-type"
              value={type}
              onChange={(e) => setType(e.target.value as AccountType)}
            >
              {ACCOUNT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field
          label="Current balance (₱)"
          htmlFor="ob-open"
          hint="Recorded as an opening balance adjustment."
        >
          <Input
            id="ob-open"
            inputMode="decimal"
            placeholder="0.00"
            value={opening}
            onChange={(e) => setOpening(e.target.value)}
            className="num"
          />
        </Field>
        {err && (
          <p role="alert" className="text-sm text-destructive">
            {err}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Setting up…" : "Start tracking"}
        </Button>
      </form>
    </div>
  );
}
