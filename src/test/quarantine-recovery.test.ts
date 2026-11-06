import { describe, expect, it, vi } from "vitest";
import { LedgerStore, memoryPersistence } from "@/lib/store";
import { syncOnce, type Remote, type RemoteRow } from "@/lib/sync-engine";

describe("quarantine recovery", () => {
  it.each([
    ["corrupt JSON", "{broken"],
    ["wrong shape", '{"items":"x","dropped":"y"}'],
  ])("preserves %s before returning an empty quarantine", async (_label, raw) => {
    const persistence = memoryPersistence();
    const store = new LedgerStore(persistence);
    await store.setKV("quarantine_v1", raw);
    const write = vi.spyOn(persistence, "setKV");
    await expect(store.getQuarantine()).resolves.toEqual({ items: [], dropped: 0 });
    const backup = write.mock.calls.find(([key]) => key.startsWith("quarantine_v1_corrupt_"));
    if (!backup) throw new Error("Missing preserved quarantine text.");
    expect(new Date(backup[0].slice("quarantine_v1_corrupt_".length)).toISOString()).toBe(
      backup[0].slice("quarantine_v1_corrupt_".length),
    );
    expect(await store.getKV(backup[0])).toBe(raw);
    expect(await store.getKV("quarantine_v1")).toBe(raw);
  });

  it("stores one malformed row after recovery and completes a repeated pull", async () => {
    const store = new LedgerStore(memoryPersistence());
    await store.setKV("quarantine_v1", "not JSON");
    const row: RemoteRow = {
      id: crypto.randomUUID(),
      kind: "space",
      space_id: null,
      data: { name: 5, type: "personal" },
      deleted: false,
      rev: 1,
      last_mutation_id: crypto.randomUUID(),
      created_at: "2026-11-06T00:00:00Z",
      updated_at: "2026-11-06T00:00:00Z",
    };
    await store.quarantine([
      { raw: row, source: "pull", reason: "name must be a string of 1-200 characters" },
    ]);
    expect((await store.getQuarantine()).items).toHaveLength(1);
    const remote: Remote = {
      push: async () => ({ status: "ok", rev: 1 }),
      pull: async () => [row],
    };
    expect((await syncOnce(store, remote)).pullOk).toBe(true);
    expect((await store.getQuarantine()).items).toHaveLength(1);
    expect(store.get(row.id)).toBeUndefined();
  });

  it("returns a valid saved quarantine unchanged", async () => {
    const store = new LedgerStore(memoryPersistence());
    const valid = {
      items: [{ id: "old", kind: "space", source: "pull", reason: "bad", at: "2026-11-06T00:00:00Z", raw: "kept" }],
      dropped: 2,
    };
    const raw = JSON.stringify(valid);
    await store.setKV("quarantine_v1", raw);
    const write = vi.spyOn(store, "setKV");
    expect(await store.getQuarantine()).toEqual(valid);
    expect(await store.getKV("quarantine_v1")).toBe(raw);
    expect(write).not.toHaveBeenCalled();
  });
});