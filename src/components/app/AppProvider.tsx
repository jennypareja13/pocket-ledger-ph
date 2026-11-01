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
  initialPullOkFlag?: boolean | undefined;
  attempted?: boolean | undefined;
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
  const activeRun = useRef<{ controller: AbortController; store: LedgerStore; userId: string } | null>(null);
  const currentProfile = useRef<string | null>(null);
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });
  useEffect(() => {
    const apply = (s: Session | null) => {
      const nextProfile = s?.user.id ?? (localStorage.getItem(GUEST_KEY) === "1" ? "guest" : null);
      if (currentProfile.current !== nextProfile) {
        activeRun.current?.controller.abort();
        activeRun.current = null;
        currentProfile.current = nextProfile;
      }
      if (s) setAuth({ status: "signed_in", userId: s.user.id, email: s.user.email ?? "" });
      else if (localStorage.getItem(GUEST_KEY) === "1") setAuth({ status: "guest" });
      else setAuth({ status: "signed_out" });
    };
    // getSession reads the saved session, so a previously signed-in user can open the app offline.
    supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data } = supabase.auth.onAuthStateChange((ev, s) => {
      if (ev === "SIGNED_IN" || ev === "SIGNED_OUT" || ev === "TOKEN_REFRESHED" || ev === "INITIAL_SESSION") apply(s);
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
  const signedIn = auth.status === "signed_in";
  const userId = auth.status === "signed_in" ? auth.userId : null;
  useEffect(() => {
    activeRun.current?.controller.abort();
    activeRun.current = null;
    setSync({ running: false, initialDone: false, initialPullOkFlag: false, attempted: false });
    let cancelled = false;
    if (store) store.getKV("initial_pull_ok").then((flag) => {
      if (!cancelled) setSync((s) => ({ ...s, initialPullOkFlag: s.initialPullOkFlag || flag === "1" }));
    }).catch((error: unknown) => {
      if (!cancelled) setSync((s) => ({ ...s, error: error instanceof Error ? error.message : "Could not read initial sync status." }));
    });
    return () => {
      cancelled = true;
      activeRun.current?.controller.abort();
      activeRun.current = null;
    };
  }, [store, userId]);

  const syncNow = useCallback(async () => {
    if (!store || !userId || currentProfile.current !== userId) return;
    if (activeRun.current?.store === store && !activeRun.current.controller.signal.aborted) return;
    if (!navigator.onLine) {
      setSync((s) => ({ ...s, attempted: true, error: "You are offline. Connect to retry loading your cloud data." }));
      return;
    }
    const run = { controller: new AbortController(), store, userId };
    activeRun.current = run;
    setSync((s) => ({ ...s, running: true, attempted: true, error: undefined }));
    try {
      const r = await syncOnce(store, cloudRemote, { userId, signal: run.controller.signal });
      if (activeRun.current !== run || run.controller.signal.aborted) return;
      if (r.pullOk) await store.setKV("initial_pull_ok", "1");
      if (activeRun.current !== run || run.controller.signal.aborted) return;
      setSync((s) => ({
        ...s, initialDone: r.pullOk, initialPullOkFlag: s.initialPullOkFlag || r.pullOk,
        error: r.error ?? (r.aborted ? "Sync was cancelled. Please retry." : undefined),
        lastSyncedAt: r.pullOk ? new Date().toISOString() : s.lastSyncedAt,
      }));
    } catch (error) {
      if (activeRun.current === run && !run.controller.signal.aborted) setSync((s) => ({ ...s, initialDone: false, error: error instanceof Error ? error.message : "Sync failed. Please retry." }));
    } finally {
      if (activeRun.current === run) {
        activeRun.current = null;
        setSync((s) => ({ ...s, running: false, error: run.controller.signal.aborted ? "Sync was cancelled. Please retry." : s.error }));
      }
    }
  }, [store, userId]);

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
    activeRun.current?.controller.abort();
    activeRun.current = null;
    setSync((s) => ({ ...s, running: false, initialDone: false, error: "Sync was cancelled." }));
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
