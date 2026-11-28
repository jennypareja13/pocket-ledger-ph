import { describe, expect, it, vi } from "vitest";
import { localWipeBlockReason, wipeLocalProfileData } from "@/lib/local-data-wipe";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    has: (key: string) => values.has(key),
  };
}

describe("local device data wipe", () => {
  it("blocks when pending changes exist without calling database deletion", async () => {
    const storage = memoryStorage({ "pl-space-user-a": "space-a" });
    const deleteDatabase = vi.fn(async () => {});
    await expect(
      wipeLocalProfileData({
        profile: "user-a",
        userId: "user-a",
        pending: 1,
        storage,
        deleteDatabase,
      }),
    ).rejects.toThrow("unsynced changes");
    expect(deleteDatabase).not.toHaveBeenCalled();
    expect(storage.has("pl-space-user-a")).toBe(true);
  });

  it("blocks after a sync error even when the pending count is zero", () => {
    expect(localWipeBlockReason({ pending: 0, syncError: "Network unavailable" })).toContain(
      "last sync failed",
    );
  });

  it("wipes only the selected user's database and local preferences after a safe sync", async () => {
    const storage = memoryStorage({
      "pl-space-user-a": "space-a",
      "pl-space-user-b": "space-b",
      "pv-privacy-consent:user-a": "consent-a",
      "pv-privacy-consent:user-b": "consent-b",
      "pv-privacy-last-user": "user-a",
    });
    const databases = new Set(["user-a", "user-b"]);
    await wipeLocalProfileData({
      profile: "user-a",
      userId: "user-a",
      pending: 0,
      storage,
      deleteDatabase: async (profile) => {
        databases.delete(profile);
      },
    });
    expect([...databases]).toEqual(["user-b"]);
    expect(storage.has("pl-space-user-a")).toBe(false);
    expect(storage.has("pv-privacy-consent:user-a")).toBe(false);
    expect(storage.has("pv-privacy-last-user")).toBe(false);
    expect(storage.has("pl-space-user-b")).toBe(true);
    expect(storage.has("pv-privacy-consent:user-b")).toBe(true);
  });

  it("supports guest mode without touching signed-in users' consent caches", async () => {
    const storage = memoryStorage({
      "pl-space-guest": "guest-space",
      "pl-guest": "1",
      "pv-privacy-consent:user-a": "consent-a",
    });
    const deleteDatabase = vi.fn(async () => {});
    await wipeLocalProfileData({
      profile: "guest",
      userId: null,
      pending: 0,
      storage,
      deleteDatabase,
    });
    expect(deleteDatabase).toHaveBeenCalledWith("guest");
    expect(storage.has("pl-space-guest")).toBe(false);
    expect(storage.has("pl-guest")).toBe(false);
    expect(storage.has("pv-privacy-consent:user-a")).toBe(true);
  });

  it("refuses to wipe a different signed-in profile", async () => {
    const deleteDatabase = vi.fn(async () => {});
    await expect(
      wipeLocalProfileData({
        profile: "user-b",
        userId: "user-a",
        pending: 0,
        storage: memoryStorage(),
        deleteDatabase,
      }),
    ).rejects.toThrow("does not match");
    expect(deleteDatabase).not.toHaveBeenCalled();
  });

  it("does not clear local preferences if database deletion fails", async () => {
    const storage = memoryStorage({ "pl-space-user-a": "space-a" });
    await expect(
      wipeLocalProfileData({
        profile: "user-a",
        userId: "user-a",
        pending: 0,
        storage,
        deleteDatabase: async () => {
          throw new Error("blocked");
        },
      }),
    ).rejects.toThrow("blocked");
    expect(storage.has("pl-space-user-a")).toBe(true);
  });
});
