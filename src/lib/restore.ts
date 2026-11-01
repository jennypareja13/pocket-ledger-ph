import type { LedgerStore } from "./store";
import { isPlainObject, validateRecord, type RecordEnvelope } from "./validate-record";

export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;
export const MAX_BACKUP_RECORDS = 20_000;

/** Complete validation precedes confirmation and the single additive write. */
export async function restoreBackup(store: LedgerStore, raw: unknown, idPolicy: "uuid" | "any", confirmImport: (newCount: number, skippedCount: number) => boolean): Promise<number | null> {
  if (!isPlainObject(raw) || raw.version !== 1 || !Array.isArray(raw.records)) throw new Error("Not a valid version 1 backup file.");
  if (raw.records.length > MAX_BACKUP_RECORDS) throw new Error("Backup must contain no more than 20,000 records.");
  const valid: RecordEnvelope[] = [];
  const reasons: string[] = [];
  let failed = 0;
  raw.records.forEach((r: unknown, i: number) => {
    const result = validateRecord(r, { idPolicy });
    if (result.ok) valid.push(result.record);
    else {
      failed++;
      if (reasons.length < 10) reasons.push(`Record ${i + 1} (${isPlainObject(r) && typeof r.kind === "string" ? r.kind : "unknown"}, ${isPlainObject(r) && typeof r.id === "string" ? r.id.slice(0, 8) : "no id"}): ${result.reason}`);
    }
  });
  if (failed) throw new Error(`${failed} record(s) failed validation. Nothing imported.\n${reasons.join("\n")}`);
  const seen = new Set(store.all().map((r) => r.id));
  const fresh = valid.filter((r) => { if (seen.has(r.id)) return false; seen.add(r.id); return true; });
  if (!confirmImport(fresh.length, valid.length - fresh.length)) return null;
  await store.putRaw(fresh.map((r) => ({ ...r, _meta: { sync: "pending", rev: 0, mutation_id: crypto.randomUUID() } })));
  return fresh.length;
}
