import { describe, expect, it, vi } from "vitest";
import { LedgerStore, memoryPersistence } from "@/lib/store";
import { RecordRejected, SyncAbort, syncOnce, type PushResult, type Remote, type RemoteRow } from "@/lib/sync-engine";
import { accountBalance } from "@/lib/selectors";
import { decideEmptyLedgerScreen } from "@/lib/empty-ledger-screen";

const row = (data: unknown = { name: "Cloud", type: "personal" }, kind: RemoteRow["kind"] = "space"): RemoteRow => ({ id: crypto.randomUUID(), kind, space_id: null, data, deleted: false, rev: 1, last_mutation_id: crypto.randomUUID(), created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z" });
const fake = (): Remote => ({ push: vi.fn(async (): Promise<PushResult> => ({ status: "ok", rev: 1 })), pull: vi.fn(async () => []) });
const screen = (report: Awaited<ReturnType<typeof syncOnce>>) => decideEmptyLedgerScreen({ authStatus: "signed_in", online: true, initialDone: report.pullOk, initialPullOkFlag: false, attempted: true, syncError: report.error });

describe("Batch 1 sync safety", () => {
  it("deduplicates repeated malformed pulls without writing or emitting again", async () => {
    const store = new LedgerStore(memoryPersistence());
    const bad = row({ name: 5 });
    const remote = fake();
    remote.pull = async () => [bad, bad];
    await syncOnce(store, remote);
    const before = await store.getQuarantine();
    const write = vi.spyOn(store, "setKV");
    await syncOnce(store, remote);
    expect(await store.getQuarantine()).toEqual(before);
    expect(before.items).toHaveLength(1);
    expect(before.dropped).toBe(0);
    expect(write.mock.calls.filter(([key]) => key === "quarantine_v1")).toHaveLength(0);
    const emit = vi.fn();
    const unsubscribe = store.subscribe(emit);
    await store.quarantine([{ raw: bad, source: "pull", reason: before.items[0]?.reason ?? "" }]);
    expect(emit).not.toHaveBeenCalled();
    unsubscribe();
  });
  it("deduplicates retained items at the cap before counting dropped records", async () => {
    const store = new LedgerStore(memoryPersistence());
    const entries = Array.from({ length: 100 }, (_, id) => ({
      raw: { id: String(id) }, source: "pull" as const, reason: "bad",
    }));
    await store.quarantine(entries);
    const write = vi.spyOn(store, "setKV");
    await store.quarantine(entries);
    expect(write).not.toHaveBeenCalled();
    await store.quarantine([
      { raw: { id: "extra" }, source: "pull", reason: "bad" },
      { raw: { id: "extra" }, source: "pull", reason: "bad" },
    ]);
    expect((await store.getQuarantine()).dropped).toBe(1);
  });
  it("compares source, id, reason and unknown raw text for quarantine dedupe", async () => {
    const store = new LedgerStore(memoryPersistence());
    await store.quarantine([
      { raw: "first", source: "pull", reason: "bad" },
      { raw: "first", source: "pull", reason: "bad" },
      { raw: "second", source: "pull", reason: "bad" },
      { raw: "first", source: "push", reason: "bad" },
      { raw: "first", source: "pull", reason: "different" },
      { raw: { id: "same", name: 1 }, source: "pull", reason: "bad" },
      { raw: { id: "same", name: 2 }, source: "pull", reason: "bad" },
    ]);
    expect((await store.getQuarantine()).items).toHaveLength(5);
  });
  it("continues later uploads and pulls after a record rejection", async () => {
    const store = new LedgerStore(memoryPersistence());
    const first = await store.save("borrower", null, { name: "First" });
    const second = await store.save("borrower", null, { name: "Second" });
    const remote = fake();
    remote.push = vi.fn(async (r): Promise<PushResult> => { if (r.id === first.id) throw new RecordRejected("Invalid record", "23514", 400); return { status: "ok", rev: 1 }; });
    const report = await syncOnce(store, remote);
    expect(report).toMatchObject({ failed: 1, pushed: 1, pullOk: true });
    expect(remote.pull).toHaveBeenCalledOnce();
    expect(store.get(first.id)?._meta.sync).toBe("error");
    expect(store.get(second.id)?._meta.sync).toBe("synced");
  });
  it("rejects outgoing missing entries without a server push", async () => {
    const store = new LedgerStore(memoryPersistence());
    const invalid = await store.save("transaction", null, { type: "expense", date: "2026-11-01", amount: 100, account_id: "cash" });
    const remote = fake();
    const report = await syncOnce(store, remote);
    expect(remote.push).not.toHaveBeenCalled();
    expect(report.failed).toBe(1);
    expect(store.get(invalid.id)?._meta.error).toContain("entries");
  });
  it("quarantines malformed pulled transactions before balance calculations", async () => {
    const store = new LedgerStore(memoryPersistence());
    const good = row({ type: "adjustment", date: "2026-11-01", amount: 500, account_id: "cash", entries: [{ account_id: "cash", delta: 500 }] }, "transaction");
    const bad = row({ type: "expense", date: "2026-11-01", amount: 100, account_id: "cash" }, "transaction");
    const remote = fake(); remote.pull = vi.fn(async () => [bad, good]);
    const report = await syncOnce(store, remote);
    expect(report.pullOk).toBe(true);
    expect(store.get(bad.id)).toBeUndefined();
    expect(accountBalance("cash", store.getSnapshot().transactions)).toBe(500);
    expect((await store.getQuarantine()).items[0]).toMatchObject({ id: bad.id, source: "pull", reason: "entries must be an array of 1-20 items" });
    expect(await store.getKV("cursor")).toBe(good.updated_at);
  });
  it("quarantine failure applies none of the batch and keeps the cursor", async () => {
    const p = memoryPersistence();
    const store = new LedgerStore({ ...p, setKV: async (k, v) => { if (k === "quarantine_v1") throw new Error("Disk full"); await p.setKV(k, v); } });
    const good = row(); const bad = row({ name: 5 });
    const remote = fake(); remote.pull = async () => [good, bad];
    expect((await syncOnce(store, remote)).pullOk).toBe(false);
    expect(store.all()).toHaveLength(0);
    expect(await store.getKV("cursor")).toBeNull();
  });
  it("caps quarantine at 100 and truncates raw to 4000 without deleting saved items", async () => {
    const store = new LedgerStore(memoryPersistence());
    await store.quarantine(Array.from({ length: 102 }, (_, id) => ({ raw: { id: String(id), note: "x".repeat(5000) }, source: "pull", reason: "bad" })));
    const saved = await store.getQuarantine();
    expect(saved.items).toHaveLength(100); expect(saved.dropped).toBe(2); expect(saved.items[0]?.raw).toHaveLength(4000);
  });
  it("session mismatch stops immediately without pushes, pulls, or writes", async () => {
    const store = new LedgerStore(memoryPersistence()); await store.save("borrower", null, { name: "A" });
    const before = structuredClone(store.all());
    const remote = fake(); remote.assertUser = async () => { throw new SyncAbort(); };
    const write = vi.spyOn(store, "putRaw");
    const report = await syncOnce(store, remote, { userId: "A", signal: new AbortController().signal });
    expect(report.aborted).toBe(true); expect(remote.push).not.toHaveBeenCalled(); expect(remote.pull).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled(); expect(store.all()).toEqual(before);
  });
  it("abort after first push discards its response and makes no subsequent writes or calls", async () => {
    const store = new LedgerStore(memoryPersistence()); await store.save("borrower", null, { name: "A" }); await store.save("borrower", null, { name: "B" });
    const controller = new AbortController(); const remote = fake();
    remote.push = vi.fn(async (): Promise<PushResult> => { controller.abort(); return { status: "ok", rev: 1 }; });
    const write = vi.spyOn(store, "putRaw");
    expect((await syncOnce(store, remote, { userId: "A", signal: controller.signal })).aborted).toBe(true);
    expect(remote.push).toHaveBeenCalledOnce(); expect(remote.pull).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled();
  });
  it("transient push failure preserves pending mutations and skips pull", async () => {
    const store = new LedgerStore(memoryPersistence()); const r = await store.save("borrower", null, { name: "A" });
    const remote = fake(); remote.push = async (): Promise<PushResult> => { throw new Error("Network failed"); };
    expect((await syncOnce(store, remote)).pullOk).toBe(false); expect(remote.pull).not.toHaveBeenCalled(); expect(store.get(r.id)?._meta).toEqual(r._meta);
  });
  it("invalid conflict data is rejected and does not stop pull", async () => {
    const store = new LedgerStore(memoryPersistence()); const r = await store.save("borrower", null, { name: "A" });
    const remote = fake(); remote.push = async (): Promise<PushResult> => ({ status: "conflict", rev: 2, data: { name: 5 }, deleted: false });
    const report = await syncOnce(store, remote); expect(report.failed).toBe(1); expect(report.pullOk).toBe(true); expect(store.get(r.id)?._meta.server).toBeUndefined();
  });
  it("failed pull forbids first onboarding; empty successful pull allows it", async () => {
    const store = new LedgerStore(memoryPersistence()); const remote = fake(); remote.pull = async () => { throw new Error("offline"); };
    const failed = await syncOnce(store, remote); expect(failed.pullOk).toBe(false); expect(screen(failed)).toBe("retry");
    remote.pull = async () => []; const success = await syncOnce(store, remote); expect(success.pullOk).toBe(true); expect(screen(success)).toBe("onboarding");
  });
  it("guest and persisted success allow onboarding, but missing first pull does not", () => {
    const input = { authStatus: "signed_in", online: true, initialDone: false, initialPullOkFlag: false };
    expect(decideEmptyLedgerScreen(input)).toBe("spinner");
    expect(decideEmptyLedgerScreen({ ...input, online: false })).toBe("retry");
    expect(decideEmptyLedgerScreen({ ...input, initialPullOkFlag: true, online: false })).toBe("onboarding");
    expect(decideEmptyLedgerScreen({ ...input, authStatus: "guest" })).toBe("onboarding");
  });
});
