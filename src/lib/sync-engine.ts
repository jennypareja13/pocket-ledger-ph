import type { LedgerStore } from "./store";
import type { Kind, LocalRecord } from "./types";

export interface RemoteRow {
  id: string;
  kind: Kind;
  space_id: string | null;
  data: unknown;
  deleted: boolean;
  rev: number;
  last_mutation_id: string;
  created_at: string;
  updated_at: string;
}
export type PushResult =
  | { status: "ok"; rev: number }
  | { status: "conflict"; rev: number; data: unknown; deleted: boolean };

export interface Remote {
  push(r: LocalRecord): Promise<PushResult>;
  /** Rows changed at or after `since` (inclusive), ascending by updated_at. */
  pull(since: string | null): Promise<RemoteRow[]>;
}

export interface SyncReport {
  pushed: number;
  pulled: number;
  conflicts: number;
  error?: string;
}

/** Decide how a server row affects the local copy. Returns null when nothing changes. */
export function mergeRemote(local: LocalRecord | undefined, row: RemoteRow): LocalRecord | null {
  const fromServer = (): LocalRecord => ({
    id: row.id, kind: row.kind, space_id: row.space_id, data: row.data, deleted: row.deleted,
    created_at: row.created_at, updated_at: row.updated_at,
    _meta: { sync: "synced", rev: row.rev, mutation_id: row.last_mutation_id },
  });
  if (!local) return fromServer();
  const m = local._meta;
  if (m.sync === "synced") return row.rev > m.rev ? fromServer() : null;
  // Local has unsynced changes: never overwrite them.
  if (row.last_mutation_id === m.mutation_id) {
    // Our upload landed but the response was lost.
    return { ...local, _meta: { sync: "synced", rev: row.rev, mutation_id: m.mutation_id } };
  }
  if (row.rev > m.rev) {
    if (m.sync === "conflict" && m.server?.rev === row.rev) return null;
    return { ...local, _meta: { ...m, sync: "conflict", server: { data: row.data, deleted: row.deleted, rev: row.rev } } };
  }
  return null;
}

/** Upload queued changes, then download remote changes. Safe to call repeatedly. */
export async function syncOnce(store: LedgerStore, remote: Remote): Promise<SyncReport> {
  const report: SyncReport = { pushed: 0, pulled: 0, conflicts: 0 };
  const queue = store
    .all()
    .filter((r) => r._meta.sync === "pending" || r._meta.sync === "error")
    .sort((a, b) => a.updated_at.localeCompare(b.updated_at));

  for (const sent of queue) {
    let res: PushResult;
    try {
      res = await remote.push(sent);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const cur = store.get(sent.id);
      if (cur && cur._meta.mutation_id === sent._meta.mutation_id)
        await store.putRaw([{ ...cur, _meta: { ...cur._meta, sync: "error", error: msg } }]);
      report.error = msg;
      return report; // keep everything local; retry later
    }
    const cur = store.get(sent.id);
    if (!cur) continue;
    const sameChange = cur._meta.mutation_id === sent._meta.mutation_id;
    if (res.status === "ok") {
      report.pushed++;
      await store.putRaw([
        { ...cur, _meta: sameChange
            ? { sync: "synced", rev: res.rev, mutation_id: cur._meta.mutation_id }
            : { ...cur._meta, rev: res.rev } },
      ]);
    } else {
      report.conflicts++;
      await store.putRaw([
        { ...cur, _meta: { ...cur._meta, sync: "conflict", error: undefined,
            server: { data: res.data, deleted: res.deleted, rev: res.rev } } },
      ]);
    }
  }

  try {
    const since = await store.getKV("cursor");
    const rows = await remote.pull(since);
    const changed: LocalRecord[] = [];
    let cursor = since;
    for (const row of rows) {
      const merged = mergeRemote(store.get(row.id), row);
      if (merged) changed.push(merged);
      if (!cursor || row.updated_at > cursor) cursor = row.updated_at;
    }
    await store.putRaw(changed);
    report.pulled = changed.length;
    report.conflicts += changed.filter((c) => c._meta.sync === "conflict").length;
    if (cursor) await store.setKV("cursor", cursor);
  } catch (e) {
    report.error = e instanceof Error ? e.message : String(e);
  }
  return report;
}
