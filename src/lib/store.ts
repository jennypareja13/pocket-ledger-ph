import type {
  Account, Borrower, Budget, Category, Kind, LocalRecord, Loan, Space, Tx,
} from "./types";

export interface Persistence {
  loadAll(): Promise<LocalRecord[]>;
  saveMany(recs: LocalRecord[]): Promise<void>;
  getKV(key: string): Promise<string | null>;
  setKV(key: string, value: string): Promise<void>;
}

export interface Snapshot {
  version: number;
  all: LocalRecord[];
  spaces: Space[];
  accounts: Account[];
  categories: Category[];
  transactions: Tx[];
  budgets: Budget[];
  borrowers: Borrower[];
  loans: Loan[];
  pending: number;
  conflicts: LocalRecord[];
  errors: number;
}

export interface Change {
  kind: Kind;
  id?: string | undefined;
  space_id: string | null;
  data: unknown;
  deleted?: boolean;
}

const uuid = () => crypto.randomUUID();

export interface QuarantineItem {
  id: string;
  kind: string;
  source: "pull" | "restore" | "push";
  reason: string;
  at: string;
  raw: string;
}
export interface Quarantine { items: QuarantineItem[]; dropped: number }

/** In-memory index over durable local storage. Every write is persisted before it resolves. */
export class LedgerStore {
  private map = new Map<string, LocalRecord>();
  private listeners = new Set<() => void>();
  private snap: Snapshot | null = null;
  private version = 0;

  constructor(private p: Persistence) {}

  async load() {
    for (const r of await this.p.loadAll()) this.map.set(r.id, r);
    this.emit();
  }

  get(id: string) {
    return this.map.get(id);
  }
  all() {
    return [...this.map.values()];
  }
  getKV(k: string) {
    return this.p.getKV(k);
  }
  setKV(k: string, v: string) {
    return this.p.setKV(k, v);
  }

  async getQuarantine(): Promise<Quarantine> {
    const saved = await this.getKV("quarantine_v1");
    return saved ? JSON.parse(saved) as Quarantine : { items: [], dropped: 0 };
  }

  async quarantine(records: { raw: unknown; source: QuarantineItem["source"]; reason: string }[], check: () => void = () => {}): Promise<void> {
    const saved = await this.getQuarantine();
    check();
    for (const entry of records) {
      if (saved.items.length >= 100) { saved.dropped++; continue; }
      const raw = entry.raw;
      const object = typeof raw === "object" && raw !== null ? raw as Record<string, unknown> : {};
      saved.items.push({ id: typeof object.id === "string" ? object.id : "unknown", kind: typeof object.kind === "string" ? object.kind : "unknown", source: entry.source, reason: entry.reason, at: new Date().toISOString(), raw: (JSON.stringify(raw) ?? String(raw)).slice(0, 4000) });
    }
    check();
    await this.setKV("quarantine_v1", JSON.stringify(saved));
    check();
    this.emit();
  }

  /** Raw write used by sync and restore; does not alter metadata. */
  async putRaw(recs: LocalRecord[]) {
    if (!recs.length) return;
    await this.p.saveMany(recs);
    for (const r of recs) this.map.set(r.id, r);
    this.emit();
  }

  /** User edits. All changes are persisted together and each gets a fresh mutation id. */
  async apply(changes: Change[]): Promise<LocalRecord[]> {
    const now = new Date().toISOString();
    const out = changes.map((c) => {
      const prev = c.id ? this.map.get(c.id) : undefined;
      const rec: LocalRecord = {
        id: c.id ?? uuid(),
        kind: c.kind,
        space_id: c.space_id,
        data: c.data,
        deleted: c.deleted ?? false,
        created_at: prev?.created_at ?? now,
        updated_at: now,
        _meta: {
          sync: prev?._meta.sync === "conflict" ? "conflict" : "pending",
          rev: prev?._meta.rev ?? 0,
          mutation_id: uuid(),
          server: prev?._meta.server,
        },
      };
      return rec;
    });
    await this.putRaw(out);
    return out;
  }

  async save<D>(kind: Kind, space_id: string | null, data: D, id?: string) {
    const [r] = await this.apply([{ kind, space_id, data, id }]);
    return r as LocalRecord<D>;
  }

  async remove(ids: string[]) {
    const changes = ids
      .map((id) => this.map.get(id))
      .filter((r): r is LocalRecord => !!r && !r.deleted)
      .map((r) => ({ kind: r.kind, id: r.id, space_id: r.space_id, data: r.data, deleted: true }));
    return this.apply(changes);
  }

  async resolveKeepMine(id: string) {
    const r = this.map.get(id);
    if (!r?._meta.server) return;
    await this.putRaw([{ ...r, _meta: { sync: "pending", rev: r._meta.server.rev, mutation_id: uuid() } }]);
  }

  async resolveUseCloud(id: string) {
    const r = this.map.get(id);
    const s = r?._meta.server;
    if (!r || !s) return;
    await this.putRaw([
      { ...r, data: s.data, deleted: s.deleted, _meta: { sync: "synced", rev: s.rev, mutation_id: r._meta.mutation_id } },
    ]);
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): Snapshot => {
    if (!this.snap) {
      const all = this.all();
      const k = <T,>(kind: Kind) => all.filter((r) => r.kind === kind && !r.deleted) as T[];
      this.snap = {
        version: this.version,
        all,
        spaces: k<Space>("space"),
        accounts: k<Account>("account"),
        categories: k<Category>("category"),
        transactions: (k<Tx>("transaction")).sort(
          (a, b) => b.data.date.localeCompare(a.data.date) || b.created_at.localeCompare(a.created_at),
        ),
        budgets: k<Budget>("budget"),
        borrowers: k<Borrower>("borrower"),
        loans: k<Loan>("loan"),
        pending: all.filter((r) => r._meta.sync === "pending" || r._meta.sync === "error").length,
        conflicts: all.filter((r) => r._meta.sync === "conflict"),
        errors: all.filter((r) => r._meta.sync === "error").length,
      };
    }
    return this.snap;
  };

  private emit() {
    this.version++;
    this.snap = null;
    this.listeners.forEach((l) => l());
  }
}

export function memoryPersistence(): Persistence {
  const recs = new Map<string, LocalRecord>();
  const kv = new Map<string, string>();
  return {
    async loadAll() {
      return [...recs.values()].map((r) => structuredClone(r));
    },
    async saveMany(rs) {
      rs.forEach((r) => recs.set(r.id, structuredClone(r)));
    },
    async getKV(k) {
      return kv.get(k) ?? null;
    },
    async setKV(k, v) {
      kv.set(k, v);
    },
  };
}
