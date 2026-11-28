export interface LocalWipeStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
}

export interface LocalWipeRequest {
  profile: string;
  userId: string | null;
  pending: number;
  syncError?: string | undefined;
  syncRunning?: boolean | undefined;
  storage: LocalWipeStorage;
  deleteDatabase: (profile: string) => Promise<void>;
}

export function localWipeBlockReason(input: {
  pending: number;
  syncError?: string | undefined;
  syncRunning?: boolean | undefined;
}): string | null {
  if (input.pending > 0) {
    return "You have unsynced changes. Connect to the internet and sync them before removing local data.";
  }
  if (input.syncError) {
    return "The last sync failed. Resolve the sync problem and successfully sync before removing local data.";
  }
  if (input.syncRunning) {
    return "Sync is still running. Wait for it to finish before removing local data.";
  }
  return null;
}

/** Deletes only one local profile after verifying that it is safe to discard its local copy. */
export async function wipeLocalProfileData(input: LocalWipeRequest): Promise<void> {
  const blocked = localWipeBlockReason(input);
  if (blocked) throw new Error(blocked);
  if (input.userId && input.profile !== input.userId)
    throw new Error("The signed-in account does not match the local profile.");
  if (!input.userId && input.profile !== "guest")
    throw new Error("A signed-out session can only remove the guest profile.");

  await input.deleteDatabase(input.profile);
  input.storage.removeItem(`pl-space-${input.profile}`);

  if (input.userId) {
    input.storage.removeItem(`pv-privacy-consent:${input.userId}`);
    if (input.storage.getItem("pv-privacy-last-user") === input.userId)
      input.storage.removeItem("pv-privacy-last-user");
  } else if (input.profile === "guest") {
    input.storage.removeItem("pl-guest");
  }
}
