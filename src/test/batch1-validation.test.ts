import { describe, expect, it } from "vitest";
import { validateRecord } from "@/lib/validate-record";
import { restoreBackup, MAX_BACKUP_RECORDS } from "@/lib/restore";
import { LedgerStore, memoryPersistence } from "@/lib/store";
import { MAX_CENTAVOS } from "@/lib/money";

const envelope = (kind: string, data: unknown) => ({
  id: crypto.randomUUID(),
  kind,
  space_id: null,
  data,
  deleted: false,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
});
const transaction = {
  type: "expense",
  date: "2026-11-01",
  amount: 100,
  account_id: "cash",
  entries: [{ account_id: "cash", delta: -100 }],
};

describe("Batch 1 record validation", () => {
  it("rejects missing entries and fractional entry deltas", () => {
    expect(
      validateRecord(envelope("transaction", { ...transaction, entries: undefined }), {
        idPolicy: "uuid",
      }).ok,
    ).toBe(false);
    expect(
      validateRecord(
        envelope("transaction", { ...transaction, entries: [{ account_id: "cash", delta: 0.5 }] }),
        { idPolicy: "uuid" },
      ),
    ).toEqual({
      ok: false,
      reason: "entries[0].delta must be a whole number within the money limit",
    });
  });
  it("accepts legacy module loans with an empty borrower and extra fields", () => {
    expect(
      validateRecord(
        envelope("loan", {
          borrower_id: "",
          account_id: "cash",
          principal: 0,
          date: "2026-11-01",
          module: "reimbursement",
          legacy: true,
        }),
        { idPolicy: "uuid" },
      ).ok,
    ).toBe(true);
  });
  it("accepts object tombstones without checking their payload", () => {
    expect(
      validateRecord({ ...envelope("transaction", {}), deleted: true }, { idPolicy: "uuid" }).ok,
    ).toBe(true);
  });
  it("enforces IDs, whole money limits, entry count, and optional field types", () => {
    expect(
      validateRecord({ ...envelope("borrower", { name: "A" }), id: "legacy" }, { idPolicy: "any" })
        .ok,
    ).toBe(true);
    expect(
      validateRecord({ ...envelope("borrower", { name: "A" }), id: "legacy" }, { idPolicy: "uuid" })
        .ok,
    ).toBe(false);
    for (const amount of [0, -1, MAX_CENTAVOS + 1, 1.1])
      expect(
        validateRecord(envelope("transaction", { ...transaction, amount }), { idPolicy: "uuid" })
          .ok,
      ).toBe(false);
    expect(
      validateRecord(
        envelope("transaction", { ...transaction, type: "adjustment", amount: -100 }),
        { idPolicy: "uuid" },
      ).ok,
    ).toBe(true);
    expect(
      validateRecord(
        envelope("transaction", {
          ...transaction,
          entries: Array.from({ length: 21 }, () => ({ loan_id: "l", delta: 0 })),
        }),
        { idPolicy: "uuid" },
      ).ok,
    ).toBe(false);
    expect(
      validateRecord(
        envelope("space", { name: "Space", type: "personal", modules: { reimbursements: "yes" } }),
        { idPolicy: "uuid" },
      ).ok,
    ).toBe(false);
  });
  it("invalid restore writes nothing, even when invalid IDs already exist", async () => {
    const store = new LedgerStore(memoryPersistence());
    const existing = await store.save("borrower", null, { name: "Original" });
    const before = structuredClone(store.all());
    const raw = {
      version: 1,
      records: [envelope("borrower", { name: "New" }), { ...existing, data: { name: 3 } }],
    };
    await expect(restoreBackup(store, raw, "uuid", () => true)).rejects.toThrow(
      "1 record(s) failed validation",
    );
    expect(store.all()).toEqual(before);
    expect(raw.records).toHaveLength(2);
  });
  it("valid restore is additive, skips duplicates, and respects cancellation", async () => {
    const store = new LedgerStore(memoryPersistence());
    const existing = await store.save("borrower", null, { name: "Original" });
    const newRecord = envelope("borrower", { name: "New" });
    expect(
      await restoreBackup(store, { version: 1, records: [newRecord] }, "uuid", () => false),
    ).toBeNull();
    expect(
      await restoreBackup(
        store,
        { version: 1, records: [{ ...existing, data: { name: "Changed" } }, newRecord, newRecord] },
        "uuid",
        (fresh, skipped) => fresh === 1 && skipped === 2,
      ),
    ).toBe(1);
    expect(store.get(existing.id)?.data).toEqual({ name: "Original" });
    expect(store.get(newRecord.id)?._meta.sync).toBe("pending");
  });
  it("rejects wrong versions and more than 20,000 records", async () => {
    const store = new LedgerStore(memoryPersistence());
    await expect(
      restoreBackup(store, { version: 2, records: [] }, "uuid", () => true),
    ).rejects.toThrow("version 1");
    await expect(
      restoreBackup(
        store,
        { version: 1, records: Array(MAX_BACKUP_RECORDS + 1).fill(null) },
        "uuid",
        () => true,
      ),
    ).rejects.toThrow("20,000");
  });
});
