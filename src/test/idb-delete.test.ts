import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteLocalProfileDatabase } from "@/lib/idb";

describe("IndexedDB profile deletion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps a blocked delete pending and resolves only after the browser reports success", async () => {
    const request = {
      onsuccess: null as IDBRequest["onsuccess"],
      onerror: null as IDBRequest["onerror"],
      onblocked: null as IDBOpenDBRequest["onblocked"],
    } as IDBOpenDBRequest;
    const deleteDatabase = vi.fn(() => request);
    vi.stubGlobal("indexedDB", { deleteDatabase });
    const onBlocked = vi.fn();

    let settled = false;
    const deletion = deleteLocalProfileDatabase("user-a", onBlocked).then(() => {
      settled = true;
    });

    expect(deleteDatabase).toHaveBeenCalledOnce();
    expect(deleteDatabase).toHaveBeenCalledWith("pocketledger-user-a");

    request.onblocked?.(new Event("blocked") as IDBVersionChangeEvent);
    await Promise.resolve();

    expect(onBlocked).toHaveBeenCalledOnce();
    expect(settled).toBe(false);

    request.onsuccess?.(new Event("success"));
    await deletion;

    expect(settled).toBe(true);
  });
});
