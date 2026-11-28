export interface LocalWipeStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
}

export interface LocalWipeSnapshot {
  pending: number;
  errors: number;
  conflicts: readonly unknown[];
}

export interface LocalWipeSyncState {
  error?: string | undefined;
  running?: boolean | undefined;
}

export interface LocalWipeRequest {
  profile: string;
  userId: string | null;
  getBlockReason: () => string | null;
  beforeDelete?: (() => Promise<void> | void) | undefined;
  storage: LocalWipeStorage;
  deleteDatabase: (profile: string, onBlocked?: () => void) => Promise<void>;
  onBlocked?: (() => void) | undefined;
  afterWipe?: (() => Promise<void> | void) | undefined;
}

export function localWipeBlockReason(
  getSnapshot: () => LocalWipeSnapshot,
  getSyncState: () => LocalWipeSyncState,
  isGuest = false,
): string | null {
  if (isGuest) return null;

  const snapshot = getSnapshot();
  const sync = getSyncState();

  if (snapshot.errors > 0) {
    return "Some changes were rejected by the server and exist only on this device. Download a backup and resolve these records before removing local data.";
  }
  if (snapshot.pending > 0) {
    return "You have unsynced changes. Connect to the internet and sync them before removing local data.";
  }
  if (snapshot.conflicts.length > 0) {
    return "You have unresolved sync conflicts. Resolve them in Settings first.";
  }
  if (sync.error) {
    return "The last sync failed. Resolve the sync problem and successfully sync before removing local data.";
  }
  if (sync.running) {
    return "Sync is still running. Wait for it to finish before removing local data.";
  }
  return null;
}

/** Stop background work, re-check live state, then remove only the selected local profile. */
export async function wipeLocalProfileData(input: LocalWipeRequest): Promise<void> {
  await input.beforeDelete?.();

  if (input.userId && input.profile !== input.userId)
    throw new Error("The signed-in account does not match the local profile.");
  if (!input.userId && input.profile !== "guest")
    throw new Error("A signed-out session can only remove the guest profile.");

  const blocked = input.getBlockReason();
  if (blocked) throw new Error(blocked);

  await input.deleteDatabase(input.profile, input.onBlocked);
  input.storage.removeItem(`pl-space-${input.profile}`);

  if (input.userId) {
    input.storage.removeItem(`pv-privacy-consent:${input.userId}`);
    if (input.storage.getItem("pv-privacy-last-user") === input.userId)
      input.storage.removeItem("pv-privacy-last-user");
  } else if (input.profile === "guest") {
    input.storage.removeItem("pl-guest");
  }

  await input.afterWipe?.();
}
