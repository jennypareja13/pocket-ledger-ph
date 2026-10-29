import type { Persistence } from "./store";
import type { LocalRecord } from "./types";

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
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
  const tx = (store: string, mode: IDBTransactionMode) => db.transaction(store, mode).objectStore(store);
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
      await req(tx("kv", "readwrite").put(v, k));
    },
  };
}
