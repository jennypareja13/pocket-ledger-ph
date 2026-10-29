import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useApp } from "@/components/app/AppProvider";
import { PageHeader, Panel } from "@/components/app/bits";
import { useSyncSummary } from "@/components/app/SyncBadge";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/config";
import { describeTx, personForTx } from "@/lib/labels";
import { centsToInput } from "@/lib/money";
import type { LocalRecord } from "@/lib/types";

export const Route = createFileRoute("/_shell/settings")({
  head: () => ({ meta: [
    { title: `Settings & sync — ${APP_NAME}` }, { name: "description", content: "Sync status, conflicts, export and backup." },
    { property: "og:title", content: `Settings — ${APP_NAME}` }, { property: "og:description", content: "Sync status, export and backup." },
  ] }),
  component: Settings,
});

function download(name: string, body: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([body], { type }));
  a.download = name;
  a.click();
}

function Settings() {
  const { auth, snap, store, syncNow, signOut } = useApp();
  const s = useSyncSummary();
  const nav = useNavigate();
  const csv = () => {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [["date", "space", "type", "amount", "fee", "category", "account", "to_account", "person", "note", "sync"]];
    for (const t of snap.transactions) {
      const d = t.data;
      rows.push([d.date, snap.spaces.find((x) => x.id === t.space_id)?.data.name ?? "", d.type, centsToInput(d.amount), d.fee ? centsToInput(d.fee) : "",
        snap.categories.find((c) => c.id === d.category_id)?.data.name ?? "", snap.accounts.find((a) => a.id === d.account_id)?.data.name ?? "",
        snap.accounts.find((a) => a.id === d.to_account_id)?.data.name ?? "", personForTx(t, snap), d.note ?? "", t._meta.sync]);
    }
    download("transactions.csv", rows.map((r) => r.map(esc).join(",")).join("\n"), "text/csv");
  };
  const backup = () => download(`${APP_NAME}-backup.json`, JSON.stringify({ app: APP_NAME, version: 1, exported_at: new Date().toISOString(),
    records: snap.all.map(({ _meta, ...r }) => r) }, null, 2), "application/json");
  async function restore(file: File) {
    if (!store) return;
    try {
      const j = JSON.parse(await file.text());
      if (j.version !== 1 || !Array.isArray(j.records)) throw new Error("Not a valid backup file");
      const fresh = (j.records as LocalRecord[]).filter((r) => typeof r.id === "string" && r.kind && r.data && !store.get(r.id));
      if (!confirm(`Import ${fresh.length} new record(s)? ${j.records.length - fresh.length} already exist and will be left unchanged.`)) return;
      await store.putRaw(fresh.map((r) => ({ ...r, _meta: { sync: "pending", rev: 0, mutation_id: crypto.randomUUID() } })));
      toast.success(`Imported ${fresh.length} record(s)`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Restore failed"); }
  }
  return (
    <>
      <PageHeader title="Settings & sync" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Account">
          <p className="text-sm">{auth.status === "signed_in" ? `Signed in as ${auth.email}` : "Device-only mode — data is not backed up to the cloud."}</p>
          <div className="mt-3 flex gap-2">
            {auth.status === "guest" && <Button onClick={() => nav({ to: "/auth" })}>Sign in to sync</Button>}
            <Button variant="outline" onClick={signOut}>Sign out</Button>
          </div>
        </Panel>
        <Panel title="Sync">
          <p className="text-sm font-medium">{s.label}</p>
          <p className="text-xs text-muted-foreground">{s.detail}</p>
          <p className="mt-2 text-xs text-muted-foreground">{snap.pending} change(s) waiting to upload. Unsynced changes are never deleted on error.</p>
          {auth.status === "signed_in" && <Button className="mt-3" size="sm" onClick={syncNow}>Sync now</Button>}
        </Panel>
        {snap.conflicts.length > 0 && (
          <Panel title="Conflicts" className="lg:col-span-2">
            {snap.conflicts.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm">
                <span>{r.kind === "transaction" ? describeTx(r as never, snap) : `${r.kind}: ${(r.data as { name?: string }).name ?? r.id}`} — edited on another device</span>
                <span className="flex gap-2">
                  <Button size="sm" onClick={() => store?.resolveKeepMine(r.id)}>Keep this device's</Button>
                  <Button size="sm" variant="outline" onClick={() => store?.resolveUseCloud(r.id)}>Use cloud version</Button>
                </span>
              </div>
            ))}
          </Panel>
        )}
        <Panel title="Export & backup" className="lg:col-span-2">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={csv}>Export transactions (CSV)</Button>
            <Button variant="outline" onClick={backup}>Download JSON backup</Button>
            <label className="inline-flex cursor-pointer items-center rounded-md border px-4 text-sm">Restore backup…
              <input type="file" accept="application/json" className="sr-only" onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
            </label>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Restore only adds records that don't already exist; nothing is overwritten.</p>
        </Panel>
      </div>
    </>
  );
}
