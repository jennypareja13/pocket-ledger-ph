import { describe, expect, it, vi } from "vitest";
import {
  GUEST_WIPE_WARNING,
  SIGNED_IN_WIPE_WARNING,
  isGuestWipeConfirmationValid,
  localWipeBlockReason,
  wipeLocalProfileData,
} from "@/lib/local-data-wipe";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    has: (key: string) => values.has(key),
  };
}

function blockReasonFor(
  state: {
    pending: number;
    errors: number;
    conflicts: unknown[];
    syncError?: string;
    syncRunning?: boolean;
  },
  guest = false,
) {
  return localWipeBlockReason(
    () => state,
    () => ({ error: state.syncError, running: state.syncRunning }),
    guest,
  );
}

describe("local device data wipe", () => {
  it("blocks rejected records with the specific device-only warning", () => {
    const state = { pending: 1, errors: 1, conflicts: [] };
    expect(blockReasonFor(state)).toContain(
      "Some changes were rejected by the server and exist only on this device",
    );
  });

  it("blocks ordinary pending changes", () => {
    expect(blockReasonFor({ pending: 1, errors: 0, conflicts: [] })).toContain("unsynced changes");
  });

  it("blocks unresolved conflicts separately from pending records", () => {
    expect(blockReasonFor({ pending: 0, errors: 0, conflicts: ["conflict"] })).toBe(
      "You have unresolved sync conflicts. Resolve them in Settings first.",
    );
  });

  it("blocks a sync error and a running sync", () => {
    expect(
      blockReasonFor({ pending: 0, errors: 0, conflicts: [], syncError: "Network unavailable" }),
    ).toContain("last sync failed");
    expect(blockReasonFor({ pending: 0, errors: 0, conflicts: [], syncRunning: true })).toContain(
      "Sync is still running",
    );
  });

  it("re-reads live state after the confirmation step instead of using stale render state", async () => {
    const state = { pending: 0, errors: 0, conflicts: [] as unknown[] };
    const storage = memoryStorage({ "pl-space-user-a": "space-a" });
    const deleteDatabase = vi.fn(async () => {});

    // Represents a new local edit made while the confirmation dialog was open.
    state.pending = 1;
    await expect(
      wipeLocalProfileData({
        profile: "user-a",
        userId: "user-a",
        getBlockReason: () => blockReasonFor(state),
        storage,
        deleteDatabase,
      }),
    ).rejects.toThrow("unsynced changes");
    expect(deleteDatabase).not.toHaveBeenCalled();
    expect(storage.has("pl-space-user-a")).toBe(true);
  });

  it("aborts and stops background work before checking state and deleting", async () => {
    const events: string[] = [];
    await wipeLocalProfileData({
      profile: "user-a",
      userId: "user-a",
      beforeDelete: () => {
        events.push("abort-and-stop");
      },
      getBlockReason: () => {
        events.push("live-check");
        return null;
      },
      storage: memoryStorage(),
      deleteDatabase: async () => {
        events.push("delete-database");
      },
    });
    expect(events).toEqual(["abort-and-stop", "live-check", "delete-database"]);
  });

  it("runs sign-out only after the database deletion succeeds", async () => {
    const events: string[] = [];
    await wipeLocalProfileData({
      profile: "user-a",
      userId: "user-a",
      getBlockReason: () => null,
      storage: memoryStorage(),
      deleteDatabase: async () => {
        events.push("database-deleted");
      },
      afterWipe: () => {
        events.push("sign-out");
      },
    });
    expect(events).toEqual(["database-deleted", "sign-out"]);
  });

  it("does not sign out or clear preferences when the database wipe fails", async () => {
    const storage = memoryStorage({ "pl-space-user-a": "space-a" });
    const signOut = vi.fn();
    await expect(
      wipeLocalProfileData({
        profile: "user-a",
        userId: "user-a",
        getBlockReason: () => null,
        storage,
        deleteDatabase: async () => {
          throw new Error("IndexedDB deletion failed");
        },
        afterWipe: signOut,
      }),
    ).rejects.toThrow("IndexedDB deletion failed");
    expect(signOut).not.toHaveBeenCalled();
    expect(storage.has("pl-space-user-a")).toBe(true);
  });

  it("wipes only the selected user's database and local preferences", async () => {
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
      getBlockReason: () => null,
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

  it("requires the exact typed DELETE phrase for guests", async () => {
    expect(SIGNED_IN_WIPE_WARNING).toBe(
      "This removes the local PocketVault database and this device's saved space and consent preferences, then signs you out. Your cloud account and cloud records are not deleted.",
    );
    expect(GUEST_WIPE_WARNING).toBe(
      "Device-only mode has NO cloud copy. This permanently deletes all your data on this device and cannot be undone. Download a backup first.",
    );
    expect(isGuestWipeConfirmationValid("DELETE")).toBe(true);
    expect(isGuestWipeConfirmationValid("delete")).toBe(false);
    expect(isGuestWipeConfirmationValid("DELETE ")).toBe(false);
  });

  it("allows guest wipe without cloud sync checks only after typed confirmation", async () => {
    const storage = memoryStorage({
      "pl-space-guest": "guest-space",
      "pl-guest": "1",
      "pv-privacy-consent:user-a": "consent-a",
    });
    const deleteDatabase = vi.fn(async () => {});
    const state = {
      pending: 7,
      errors: 3,
      conflicts: ["local-only"],
      syncError: "offline",
      syncRunning: true,
    };
    const getBlockReason = () => blockReasonFor(state, true);

    await expect(
      wipeLocalProfileData({
        profile: "guest",
        userId: null,
        getBlockReason,
        storage,
        deleteDatabase,
      }),
    ).rejects.toThrow("Type DELETE exactly");

    await wipeLocalProfileData({
      profile: "guest",
      userId: null,
      guestConfirmation: "DELETE",
      getBlockReason,
      storage,
      deleteDatabase,
    });
    expect(deleteDatabase).toHaveBeenCalledWith("guest", undefined);
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
        getBlockReason: () => null,
        storage: memoryStorage(),
        deleteDatabase,
      }),
    ).rejects.toThrow("does not match");
    expect(deleteDatabase).not.toHaveBeenCalled();
  });
});
