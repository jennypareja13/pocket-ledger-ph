import type { Persistence } from "./store";
import type { LocalRecord } from "./types";

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

const openDatabases = new Map<string, Set<IDBDatabase>>();

function trackDatabase(name: string, db: IDBDatabase): void {
  const connections = openDatabases.get(name) ?? new Set<IDBDatabase>();
  connections.add(db);
  openDatabases.set(name, connections);
  db.addEventListener("close", () => {
    connections.delete(db);
    if (connections.size === 0) openDatabases.delete(name);
  });
}

/** Close this tab's open connections, then delete only the requested profile database. */
export async function deleteLocalProfileDatabase(profile: string): Promise<void> {
  const name = `pocketledger-${profile}`;
  for (const db of openDatabases.get(name) ?? []) db.close();
  openDatabases.delete(name);

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Could not remove local data."));
    request.onblocked = () =>
      reject(new Error("PocketVault is open in another tab. Close other PocketVault tabs and try again."));
  });
}

/** Durable on-device storage. One database per signed-in user (or the device-only profile). */
export async function idbPersistence(profile: string): Promise<Persistence> {
  const open = indexedDB.open(`pocketledger-${profile}`, 1);
  open.onupgradeneeded = () => {
    const db = open.result;
    db.createObjectStore("records", { keyPath: "id" });
    db.createObjectStore("kv");
  };
  const db = await req(open);
  trackDatabase(`pocketledger-${profile}`, db);
  const tx = (store: string, mode: IDBTransactionMode) =>
    db.transaction(store, mode).objectStore(store);
  return {
    loadAll: () => req(tx("records", "readonly").getAll()) as Promise<LocalRecord[]>,
    saveMany: (recs) =>
      new Promise<void>((res, rej) => {
        const t = db.transaction("records", "readwrite");
        const s = t.objectStore("records");
        recs.forEach((r) => s.put(r));
        t.oncomplete = () => res();
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error);
      }),
    getKV: async (k) => ((await req(tx("kv", "readonly").get(k))) as string | undefined) ?? null,
    setKV: async (k, v) => {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction("kv", "readwrite");
        transaction.objectStore("kv").put(v, k);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    },
  };
}
