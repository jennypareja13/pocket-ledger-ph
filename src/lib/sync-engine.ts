import type { LedgerStore } from "./store";
import type { Kind, LocalRecord } from "./types";
import { validateRecord } from "./validate-record";

export class SyncAbort extends Error {
  constructor(
    message = "Sync stopped because the signed-in account changed.",
    public readonly code?: string | undefined,
    public readonly status?: number | undefined,
  ) {
    super(message);
    this.name = "SyncAbort";
  }
}
export class RecordRejected extends Error {
  constructor(
    message: string,
    public readonly code?: string | undefined,
    public readonly status?: number | undefined,
  ) {
    super(message);
    this.name = "RecordRejected";
  }
}
export interface SyncContext {
  userId: string;
  signal: AbortSignal;
}

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
  assertUser?(userId: string): Promise<void>;
  push(r: LocalRecord): Promise<PushResult>;
  /** Rows changed at or after `since` (inclusive), ascending by updated_at. */
  pull(since: string | null, ctx?: SyncContext): Promise<RemoteRow[]>;
}

export interface SyncReport {
  pushed: number;
  pulled: number;
  conflicts: number;
  failed: number;
  pullOk: boolean;
  aborted?: boolean | undefined;
  error?: string | undefined;
}

/** Decide how a server row affects the local copy. Returns null when nothing changes. */
export function mergeRemote(local: LocalRecord | undefined, row: RemoteRow): LocalRecord | null {
  const fromServer = (): LocalRecord => ({
    id: row.id,
    kind: row.kind,
    space_id: row.space_id,
    data: row.data,
    deleted: row.deleted,
    created_at: row.created_at,
    updated_at: row.updated_at,
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
    return {
      ...local,
      _meta: {
        ...m,
        sync: "conflict",
        server: { data: row.data, deleted: row.deleted, rev: row.rev },
      },
    };
  }
  return null;
}

/** Upload queued changes, then download remote changes. Safe to call repeatedly. */
export async function syncOnce(
  store: LedgerStore,
  remote: Remote,
  ctx?: SyncContext,
): Promise<SyncReport> {
  const report: SyncReport = { pushed: 0, pulled: 0, conflicts: 0, failed: 0, pullOk: false };
  const check = () => {
    if (ctx?.signal.aborted) throw new SyncAbort("Sync was cancelled.");
  };
  const assert = async () => {
    check();
    if (ctx && remote.assertUser) await remote.assertUser(ctx.userId);
    check();
  };
  const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
  const markRejected = async (sent: LocalRecord, reason: string) => {
    check();
    const cur = store.get(sent.id);
    if (cur && cur._meta.mutation_id === sent._meta.mutation_id) {
      await store.putRaw([{ ...cur, _meta: { ...cur._meta, sync: "error", error: reason } }]);
      check();
    }
    report.failed++;
    report.error = reason;
  };
  try {
    const queue = store
      .all()
      .filter((r) => r._meta.sync === "pending" || r._meta.sync === "error")
      .sort((a, b) => a.updated_at.localeCompare(b.updated_at));
    for (const sent of queue) {
      await assert();
      const validation = validateRecord(sent, { idPolicy: "uuid" });
      if (!validation.ok) {
        await markRejected(sent, `Cannot sync record: ${validation.reason}`);
        continue;
      }
      let res: PushResult;
      try {
        res = await remote.push(sent);
        await assert();
        if (res.status === "conflict") {
          const conflict = validateRecord(
            { ...sent, data: res.data, deleted: res.deleted },
            { idPolicy: "uuid" },
          );
          if (!conflict.ok) throw new RecordRejected(`Cloud conflict rejected: ${conflict.reason}`);
        }
      } catch (error) {
        check();
        if (error instanceof SyncAbort) throw error;
        await assert();
        if (error instanceof RecordRejected) {
          await markRejected(sent, error.message);
          continue;
        }
        report.error = message(error);
        return report; // Transient failures leave the mutation queued unchanged and skip pull.
      }
      check();
      const cur = store.get(sent.id);
      if (!cur) continue;
      const sameChange = cur._meta.mutation_id === sent._meta.mutation_id;
      if (res.status === "ok") {
        await store.putRaw([
          {
            ...cur,
            _meta: sameChange
              ? { sync: "synced", rev: res.rev, mutation_id: cur._meta.mutation_id }
              : { ...cur._meta, rev: res.rev },
          },
        ]);
        check();
        report.pushed++;
      } else {
        await store.putRaw([
          {
            ...cur,
            _meta: {
              ...cur._meta,
              sync: "conflict",
              error: undefined,
              server: { data: res.data, deleted: res.deleted, rev: res.rev },
            },
          },
        ]);
        check();
        report.conflicts++;
      }
    }
    await assert();
    const since = await store.getKV("cursor");
    await assert();
    const rows = await remote.pull(since, ctx);
    await assert();
    const changed: LocalRecord[] = [];
    const rejected: { raw: unknown; source: "pull"; reason: string }[] = [];
    let cursor = since;
    for (const row of rows) {
      const validation = validateRecord(row, { idPolicy: "uuid" });
      if (!validation.ok) rejected.push({ raw: row, source: "pull", reason: validation.reason });
      else {
        const merged = mergeRemote(store.get(row.id), row);
        if (merged) changed.push(merged);
      }
      // Invalid timestamps cannot become a cursor; inclusive pulls safely retry them.
      if (
        typeof row?.updated_at === "string" &&
        Number.isFinite(Date.parse(row.updated_at)) &&
        (!cursor || row.updated_at > cursor)
      )
        cursor = row.updated_at;
    }
    if (rejected.length) {
      check();
      await store.quarantine(rejected, check);
      check();
    }
    check();
    await store.putRaw(changed);
    check();
    if (cursor) {
      await store.setKV("cursor", cursor);
      check();
    }
    report.pulled = changed.length;
    report.conflicts += changed.filter((c) => c._meta.sync === "conflict").length;
    report.pullOk = true;
  } catch (error) {
    report.error = message(error);
    if (error instanceof SyncAbort || ctx?.signal.aborted) report.aborted = true;
  }
  return report;
}
