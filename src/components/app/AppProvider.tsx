import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { idbPersistence } from "@/lib/idb";
import { LedgerStore, type Snapshot } from "@/lib/store";
import { syncOnce } from "@/lib/sync-engine";
import { cloudRemote } from "@/lib/remote";
import type { Tx, TxType } from "@/lib/types";

export type AuthState =
  | { status: "loading" }
  | { status: "signed_out" }
  | { status: "guest" }
  | { status: "signed_in"; userId: string; email: string };

export interface SyncStatus {
  running: boolean;
  lastSyncedAt?: string | undefined;
  error?: string | undefined;
  initialDone: boolean;
}

export interface TxDialogState {
  open: boolean;
  edit?: Tx;
  preset?: { type?: TxType; loan_id?: string; account_id?: string };
}

interface AppCtx {
  auth: AuthState;
  store: LedgerStore | null;
  snap: Snapshot;
  loadError?: string | undefined;
  online: boolean;
  sync: SyncStatus;
  syncNow: () => Promise<void>;
  spaceId: string | null;
  setSpaceId: (id: string) => void;
  txDialog: TxDialogState;
  openTx: (s?: Omit<TxDialogState, "open">) => void;
  closeTx: () => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AppCtx | null>(null);
export function useApp() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp outside AppProvider");
  return c;
}

const EMPTY: Snapshot = {
  version: 0, all: [], spaces: [], accounts: [], categories: [], transactions: [], budgets: [],
  borrowers: [], loans: [], pending: 0, conflicts: [], errors: 0,
};
const noopSub = () => () => {};
const emptySnap = () => EMPTY;
export const GUEST_KEY = "pl-guest";

export function AppProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });
  useEffect(() => {
    const apply = (s: Session | null) => {
      if (s) setAuth({ status: "signed_in", userId: s.user.id, email: s.user.email ?? "" });
      else if (localStorage.getItem(GUEST_KEY) === "1") setAuth({ status: "guest" });
      else setAuth({ status: "signed_out" });
    };
    // getSession reads the saved session, so a previously signed-in user can open the app offline.
    supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data } = supabase.auth.onAuthStateChange((ev, s) => {
      if (ev === "SIGNED_IN" || ev === "SIGNED_OUT") apply(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const profile = auth.status === "signed_in" ? auth.userId : auth.status === "guest" ? "guest" : null;
  const [store, setStore] = useState<LedgerStore | null>(null);
  const [loadError, setLoadError] = useState<string>();
  useEffect(() => {
    setStore(null);
    if (!profile) return;
    let cancelled = false;
    idbPersistence(profile)
      .then(async (p) => {
        const s = new LedgerStore(p);
        await s.load();
        if (!cancelled) setStore(s);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [profile]);

  const snap = useSyncExternalStore(store?.subscribe ?? noopSub, store?.getSnapshot ?? emptySnap, emptySnap);

  const [online, setOnline] = useState(true);
  useEffect(() => {
    const up = () => setOnline(navigator.onLine);
    up();
    window.addEventListener("online", up);
    window.addEventListener("offline", up);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", up);
    };
  }, []);

  const [sync, setSync] = useState<SyncStatus>({ running: false, initialDone: false });
  const running = useRef(false);
  const signedIn = auth.status === "signed_in";
  const syncNow = useCallback(async () => {
    if (!store || !signedIn || !navigator.onLine || running.current) return;
    running.current = true;
    setSync((s) => ({ ...s, running: true }));
    const r = await syncOnce(store, cloudRemote);
    running.current = false;
    setSync((s) => ({
      running: false,
      initialDone: true,
      error: r.error,
      lastSyncedAt: r.error ? s.lastSyncedAt : new Date().toISOString(),
    }));
  }, [store, signedIn]);

  useEffect(() => {
    setSync({ running: false, initialDone: false });
  }, [store]);
  useEffect(() => {
    if (!online) return;
    syncNow();
    const t = setInterval(syncNow, 30_000);
    return () => clearInterval(t);
  }, [online, syncNow]);
  // Upload shortly after local changes.
  useEffect(() => {
    if (!store) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const unsub = store.subscribe(() => {
      if (store.getSnapshot().pending === 0) return;
      clearTimeout(t);
      t = setTimeout(syncNow, 1200);
    });
    return () => {
      clearTimeout(t);
      unsub();
    };
  }, [store, syncNow]);

  const [spaceId, setSpaceIdState] = useState<string | null>(null);
  useEffect(() => {
    if (!store || !profile) return;
    const active = snap.spaces.filter((s) => !s.data.archived);
    if (spaceId && snap.spaces.some((s) => s.id === spaceId)) return;
    const saved = localStorage.getItem(`pl-space-${profile}`);
    const pick = active.find((s) => s.id === saved) ?? active.find((s) => s.data.type === "personal") ?? active[0];
    setSpaceIdState(pick?.id ?? null);
  }, [store, profile, snap.spaces, spaceId]);
  const setSpaceId = (id: string) => {
    setSpaceIdState(id);
    if (profile) localStorage.setItem(`pl-space-${profile}`, id);
  };

  const [txDialog, setTxDialog] = useState<TxDialogState>({ open: false });

  const signOut = async () => {
    localStorage.removeItem(GUEST_KEY);
    if (signedIn) await supabase.auth.signOut();
    else setAuth({ status: "signed_out" });
  };

  return (
    <Ctx.Provider
      value={{
        auth, store, snap, loadError, online, sync, syncNow, spaceId, setSpaceId, txDialog,
        openTx: (s) => setTxDialog({ open: true, ...s }),
        closeTx: () => setTxDialog({ open: false }),
        signOut,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

/** Helpers scoped to the selected space. */
export function useSpace() {
  const { snap, spaceId } = useApp();
  const space = snap.spaces.find((s) => s.id === spaceId) ?? null;
  const inSpace = <T extends { space_id: string | null }>(xs: T[]) => xs.filter((x) => x.space_id === spaceId);
  return {
    space,
    spaceId,
    accounts: inSpace(snap.accounts),
    categories: inSpace(snap.categories),
    transactions: inSpace(snap.transactions),
    budgets: inSpace(snap.budgets),
    loans: inSpace(snap.loans),
  };
}
