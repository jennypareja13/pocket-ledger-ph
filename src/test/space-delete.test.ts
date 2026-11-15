import { describe, expect, it } from "vitest";
import { createAccount, createSpace, deleteEmptyManagedSpace } from "@/lib/actions";
import { LedgerStore, memoryPersistence } from "@/lib/store";

describe("deleteEmptyManagedSpace", () => {
  it("deletes an unused managed space and its categories as tombstones", async () => {
    const store = new LedgerStore(memoryPersistence());
    await store.load();
    const main = await createSpace(store, "Main", "personal");
    const managed = await createSpace(store, "Unused fund", "managed", main);
    const categoryIds = store
      .getSnapshot()
      .categories.filter((item) => item.space_id === managed)
      .map((item) => item.id);

    await deleteEmptyManagedSpace(store, managed);

    expect(store.get(managed)?.deleted).toBe(true);
    expect(categoryIds.every((id) => store.get(id)?.deleted)).toBe(true);
    expect(store.getSnapshot().spaces.some((item) => item.id === managed)).toBe(false);
    expect(store.getSnapshot().categories.some((item) => item.space_id === managed)).toBe(false);
  });

  it("refuses to delete a managed space with an account and leaves all records unchanged", async () => {
    const store = new LedgerStore(memoryPersistence());
    await store.load();
    const main = await createSpace(store, "Main", "personal");
    const managed = await createSpace(store, "Fund", "managed", main);
    await createAccount(store, managed, "Fund cash", "cash", 0);
    const before = structuredClone(store.all());

    await expect(deleteEmptyManagedSpace(store, managed)).rejects.toThrow(
      "contains financial records",
    );
    expect(store.all()).toEqual(before);
  });

  it("refuses personal spaces and managed spaces with child spaces", async () => {
    const store = new LedgerStore(memoryPersistence());
    await store.load();
    const main = await createSpace(store, "Main", "personal");
    const parent = await createSpace(store, "Parent", "managed", main);
    await createSpace(store, "Child", "managed", parent);
    const before = structuredClone(store.all());

    await expect(deleteEmptyManagedSpace(store, main)).rejects.toThrow(
      "Only a managed space",
    );
    await expect(deleteEmptyManagedSpace(store, parent)).rejects.toThrow("child spaces");
    expect(store.all()).toEqual(before);
  });
});
