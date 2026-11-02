import { describe, expect, it } from "vitest";
import { createAccount, createSpace } from "@/lib/actions";
import { homeSpaceOverview, ordinaryLoans, spaceCash, spacesPageSpaces } from "@/lib/selectors";
import { LedgerStore, memoryPersistence } from "@/lib/store";
import type { LoanData, SpaceData } from "@/lib/types";

async function setup() {
  const store = new LedgerStore(memoryPersistence());
  const main = await createSpace(store, "Private Main", "personal");
  const other = await createSpace(store, "Other private Main", "personal");
  const child = await createSpace(store, "Own managed child", "managed", main);
  const otherChild = await createSpace(store, "Other managed child", "managed", other);
  const legacy = await createSpace(store, "Legacy managed", "managed");
  const legacyRecord = store.getSnapshot().spaces.find((s) => s.id === legacy);
  if (!legacyRecord) throw new Error("Missing legacy fixture");
  const { parent_space_id: omittedParent, ...legacyData } = legacyRecord.data;
  void omittedParent;
  await store.save<SpaceData>("space", legacy, legacyData, legacy);
  const reimbursement = await store.save<SpaceData>("space", null, {
    name: "Reimbursement only",
    type: "personal",
    purpose: "reimbursement",
    parent_space_id: main,
  });
  const archived = await createSpace(store, "Archived managed", "managed", main);
  const archivedRecord = store.getSnapshot().spaces.find((s) => s.id === archived);
  if (!archivedRecord) throw new Error("Missing archived fixture");
  await store.save<SpaceData>(
    "space",
    archived,
    { ...archivedRecord.data, archived: true },
    archived,
  );
  await createAccount(store, main, "Private bank", "bank", 12345600);
  await createAccount(store, other, "Other bank", "bank", 87654300);
  await createAccount(store, child, "Managed cash", "cash", 50000);
  return { store, main, other, child, otherChild, legacy, reimbursement: reimbursement.id };
}

describe("Batch 2 space privacy", () => {
  it("Main overview includes only its managed children, never personal names or balances", async () => {
    const { store, main, other, child, otherChild, legacy } = await setup();
    const snap = store.getSnapshot();
    const overview = homeSpaceOverview(main, snap.spaces);
    expect(overview.map((s) => s.id)).toEqual([child, legacy]);
    const displayed = overview.map((s) => ({
      name: s.data.name,
      balance: spaceCash(s.id, snap.accounts, snap.transactions),
    }));
    expect(displayed).toEqual([
      { name: "Own managed child", balance: 50000 },
      { name: "Legacy managed", balance: 0 },
    ]);
    expect(homeSpaceOverview(other, snap.spaces).map((s) => s.id)).toEqual([otherChild]);
    expect(spaceCash(main, snap.accounts, snap.transactions)).toBe(12345600);
  });
  it("managed and purpose space overviews are empty", async () => {
    const { store, child, reimbursement } = await setup();
    expect(homeSpaceOverview(child, store.getSnapshot().spaces)).toEqual([]);
    expect(homeSpaceOverview(reimbursement, store.getSnapshot().spaces)).toEqual([]);
    expect(homeSpaceOverview("missing", store.getSnapshot().spaces)).toEqual([]);
  });
  it("Spaces shows only the selected managed space while Main keeps current visibility", async () => {
    const { store, main, child } = await setup();
    const spaces = store.getSnapshot().spaces;
    expect(spacesPageSpaces(child, spaces).map((s) => s.data.name)).toEqual(["Own managed child"]);
    expect(spacesPageSpaces(main, spaces).map((s) => s.id)).toEqual(
      spaces.filter((s) => !s.data.purpose).map((s) => s.id),
    );
  });
});

describe("Batch 2 ordinary loan visibility", () => {
  it("keeps ordinary loans including settled history and excludes both modules", async () => {
    const store = new LedgerStore(memoryPersistence());
    const data: LoanData = {
      borrower_id: "person",
      account_id: "cash",
      principal: 200000,
      date: "2026-11-02",
    };
    const ordinary = await store.save("loan", "main", data);
    const settled = await store.save("loan", "main", { ...data, settled_at: "2026-11-02" });
    await store.save("loan", "main", { ...data, module: "investment" });
    await store.save("loan", "main", { ...data, module: "reimbursement" });
    expect(ordinaryLoans(store.getSnapshot().loans).map((l) => l.id)).toEqual([
      ordinary.id,
      settled.id,
    ]);
    expect(store.getSnapshot().loans).toHaveLength(4);
  });
});
