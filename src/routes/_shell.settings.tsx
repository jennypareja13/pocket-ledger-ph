import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useApp, useSpace } from "@/components/app/AppProvider";
import { PageHeader, Panel } from "@/components/app/bits";
import { useSyncSummary } from "@/components/app/SyncBadge";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/config";
import { describeTx } from "@/lib/labels";
import { downloadFile, exportSpaceCsv } from "@/lib/csv";
import { todayManila } from "@/lib/dates";
import { MAX_BACKUP_BYTES, restoreBackup } from "@/lib/restore";
import type { Quarantine } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { useThemePreference } from "@/components/app/ThemeProvider";
import { bnplEnabled, toggleBnpl } from "@/lib/bnpl-actions";
import { mainSpaces } from "@/lib/selectors";
import { GUEST_WIPE_WARNING, localWipeBlockReason } from "@/lib/local-data-wipe";

export const Route = createFileRoute("/_shell/settings")({
  head: () => ({
    meta: [
      { title: `Settings & sync — ${APP_NAME}` },
      { name: "description", content: "Sync status, conflicts, export and backup." },
      { property: "og:title", content: `Settings — ${APP_NAME}` },
      { property: "og:description", content: "Sync status, export and backup." },
    ],
  }),
  component: Settings,
});

function Settings() {
  const { auth, snap, store, sync, syncNow, signOut, wipeLocalData, wipeStatus } = useApp();
  const s = useSyncSummary();
  const nav = useNavigate();
  const { space } = useSpace();
  const { theme, setTheme } = useThemePreference();
  const [from, setFrom] = useState(todayManila().slice(0, 7) + "-01");
  const [to, setTo] = useState(todayManila());
  const [quarantine, setQuarantine] = useState<Quarantine>({ items: [], dropped: 0 });
  const isMainSpace = !!space && mainSpaces(snap.spaces).some((item) => item.id === space.id);
  const bnplOn = isMainSpace && !!space && bnplEnabled(snap, space.id);
  const [bnplBusy, setBnplBusy] = useState(false);
  const [wipeBusy, setWipeBusy] = useState(false);
  const [guestWipeOpen, setGuestWipeOpen] = useState(false);
  const [guestWipeText, setGuestWipeText] = useState("");
  const wipeBlockReason = localWipeBlockReason(
    () => snap,
    () => sync,
    auth.status === "guest",
  );

  async function removeDeviceData(guestConfirmation?: string) {
    setWipeBusy(true);
    try {
      await wipeLocalData(guestConfirmation);
      toast.success("Local PocketVault data removed. You have been signed out.");
      await nav({ to: "/auth", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove local data.");
    } finally {
      setWipeBusy(false);
      setGuestWipeOpen(false);
      setGuestWipeText("");
    }
  }

  function requestDeviceDataRemoval() {
    if (auth.status === "guest") {
      setGuestWipeText("");
      setGuestWipeOpen(true);
      return;
    }
    const confirmed = confirm(
      "Remove PocketVault data from this device and sign out? This permanently deletes the local copy for this account from this browser/app. Cloud data is not deleted. Download a backup first if you want to keep a separate copy.",
    );
    if (confirmed) void removeDeviceData();
  }

  async function changeBnpl(enabled: boolean) {
    if (!store || !space || !isMainSpace) return;
    setBnplBusy(true);
    try {
      await toggleBnpl(store, space.id, enabled);
      toast.success(
        enabled
          ? "BNPL tracking enabled."
          : "BNPL tracking disabled. Your existing records are preserved.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update BNPL settings.");
    } finally {
      setBnplBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    if (store)
      store
        .getQuarantine()
        .then((value) => {
          if (!cancelled) setQuarantine(value);
        })
        .catch(() => {
          if (!cancelled) toast.error("Could not load skipped records.");
        });
    return () => {
      cancelled = true;
    };
  }, [store, snap.version]);
  const csv = () => {
    if (!space) return;
    try {
      const result = exportSpaceCsv(snap, space, from, to);
      downloadFile(result.filename, result.body, "text/csv;charset=utf-8");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not export.");
    }
  };
  const backup = () =>
    downloadFile(
      `${APP_NAME}-backup.json`,
      JSON.stringify(
        {
          app: APP_NAME,
          version: 1,
          exported_at: new Date().toISOString(),
          records: snap.all.map(({ _meta, ...r }) => r),
        },
        null,
        2,
      ),
      "application/json",
    );
  async function restore(file: File) {
    if (!store) return;
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error("Backup file must be 10 MB or smaller.");
      const raw: unknown = JSON.parse(await file.text());
      const count = await restoreBackup(
        store,
        raw,
        auth.status === "signed_in" ? "uuid" : "any",
        (fresh, skipped) =>
          confirm(
            `Import ${fresh} new record(s)? ${skipped} already exist and will be left unchanged.`,
          ),
      );
      if (count !== null) toast.success(`Imported ${count} record(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Restore failed");
    }
  }
  return (
    <>
      <PageHeader title="Settings & sync" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Appearance">
          <label htmlFor="theme-preference" className="mb-2 block text-sm font-medium">
            Theme
          </label>
          <select
            id="theme-preference"
            aria-describedby="theme-help"
            className="field max-w-sm"
            value={theme}
            onChange={(event) => setTheme(event.target.value as "light" | "dark" | "system")}
          >
            <option value="system">Use device setting</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
          <p id="theme-help" className="mt-2 text-xs text-muted-foreground">
            Your choice is saved on this device. Device setting follows your operating system
            appearance.
          </p>
        </Panel>
        <Panel title="Account">
          <p className="text-sm">
            {auth.status === "signed_in"
              ? `Signed in as ${auth.email}`
              : "Device-only mode — data is not backed up to the cloud."}
          </p>
          <div className="mt-3 flex gap-2">
            {auth.status === "guest" && (
              <Button onClick={() => nav({ to: "/auth" })}>Sign in to sync</Button>
            )}
            <Button variant="outline" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </Panel>
        {isMainSpace && space && (
          <Panel title="BNPL tracking">
            <label htmlFor="bnpl-tracking-enabled" className="flex items-start gap-3 text-sm">
              <input
                id="bnpl-tracking-enabled"
                type="checkbox"
                className="mt-1 size-4 accent-primary"
                checked={bnplOn}
                disabled={bnplBusy}
                onChange={(event) => changeBnpl(event.target.checked)}
              />
              <span>
                <span className="font-medium">Enable BNPL tracking</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  When disabled, the BNPL tab and BNPL budget are hidden. Your existing plans,
                  payment history, and saved budget are kept and restored when you turn tracking on
                  again.
                </span>
              </span>
            </label>
          </Panel>
        )}
        {(auth.status === "signed_in" || auth.status === "guest") && (
          <Panel title="Sign out and remove data from this device">
            {auth.status === "guest" ? (
              <p className="text-sm">{GUEST_WIPE_WARNING}</p>
            ) : (
              <p className="text-sm">
                This removes the local PocketVault database and this device's saved space and consent
                preferences, then signs you out. Your cloud account and cloud records are not deleted.
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              {auth.status === "guest"
                ? "Guest data is stored only on this device. You must type DELETE to continue."
                : "This action is blocked while unsynced or rejected changes, unresolved conflicts, a sync error, or a running sync remains. Download a backup first if you need a separate copy."}
            </p>
            {wipeBlockReason && (
              <p className="mt-2 text-sm text-destructive" role="status">
                {wipeBlockReason}
              </p>
            )}
            {wipeStatus && (
              <p className="mt-2 text-sm text-amber-700" role="status">
                {wipeStatus}
              </p>
            )}
            <Button
              className="mt-3"
              variant="destructive"
              onClick={requestDeviceDataRemoval}
              disabled={wipeBusy || !!wipeBlockReason}
            >
              {wipeBusy ? "Removing local data…" : "Sign out and remove local data"}
            </Button>
            {guestWipeOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="guest-wipe-title"
                  aria-describedby="guest-wipe-warning"
                  className="w-full max-w-md rounded-lg border bg-background p-5 shadow-xl"
                >
                  <h2 id="guest-wipe-title" className="text-lg font-semibold">
                    Permanently delete device-only data?
                  </h2>
                  <p id="guest-wipe-warning" className="mt-2 text-sm">
                    {GUEST_WIPE_WARNING}
                  </p>
                  <label htmlFor="guest-wipe-confirmation" className="mt-4 block text-sm font-medium">
                    Type DELETE to confirm
                  </label>
                  <Input
                    id="guest-wipe-confirmation"
                    autoComplete="off"
                    value={guestWipeText}
                    onChange={(event) => setGuestWipeText(event.target.value)}
                    placeholder="DELETE"
                  />
                  <div className="mt-4 flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setGuestWipeOpen(false);
                        setGuestWipeText("");
                      }}
                      disabled={wipeBusy}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => void removeDeviceData(guestWipeText)}
                      disabled={wipeBusy || guestWipeText !== "DELETE"}
                    >
                      Permanently delete
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Panel>
        )}
        <Panel title="Sync">
          <p className="text-sm font-medium">{s.label}</p>
          <p className="text-xs text-muted-foreground">{s.detail}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {snap.pending} change(s) waiting to upload. Unsynced changes are never deleted on error.
          </p>
          {auth.status === "signed_in" && (
            <Button className="mt-3" size="sm" onClick={syncNow}>
              Sync now
            </Button>
          )}
        </Panel>
        {snap.conflicts.length > 0 && (
          <Panel title="Conflicts" className="lg:col-span-2">
            {snap.conflicts.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm"
              >
                <span>
                  {r.kind === "transaction"
                    ? describeTx(r as never, snap)
                    : `${r.kind}: ${(r.data as { name?: string }).name ?? r.id}`}{" "}
                  — edited on another device
                </span>
                <span className="flex gap-2">
                  <Button size="sm" onClick={() => store?.resolveKeepMine(r.id)}>
                    Keep this device's
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => store?.resolveUseCloud(r.id)}>
                    Use cloud version
                  </Button>
                </span>
              </div>
            ))}
          </Panel>
        )}
        {quarantine.items.length > 0 && (
          <Panel title="Skipped records" className="lg:col-span-2">
            <p className="text-sm">
              {quarantine.items.length} saved record(s); {quarantine.dropped} additional skipped
              record(s).
            </p>
            <div className="my-3 space-y-2">
              {quarantine.items.map((item, index) => (
                <p key={index} className="break-words text-sm">
                  {item.kind} · {item.id.slice(0, 8)} · {item.source} — {item.reason}
                </p>
              ))}
            </div>
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(JSON.stringify(quarantine, null, 2));
                  toast.success("Details copied.");
                } catch {
                  toast.error("Could not copy details. Please retry.");
                }
              }}
            >
              Copy details
            </Button>
          </Panel>
        )}
        <Panel title="Export & backup" className="lg:col-span-2">
          <p className="mb-3 text-sm">{space?.data.name ?? "No space selected"}</p>
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <label className="text-sm">
              From
              <Input
                aria-label="CSV from date"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="text-sm">
              To
              <Input
                aria-label="CSV to date"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <Button variant="outline" onClick={csv} disabled={!space}>
              Export transactions (CSV)
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={backup}>
              Download JSON backup
            </Button>
            <label className="inline-flex cursor-pointer items-center rounded-md border px-4 text-sm">
              Restore backup…
              <input
                type="file"
                accept="application/json"
                className="sr-only"
                onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])}
              />
            </label>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Restore only adds records that don't already exist; nothing is overwritten.
          </p>
        </Panel>
      </div>
    </>
  );
}
