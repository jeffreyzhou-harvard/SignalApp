import type { StorageAdapter } from "./types";
import { jsonFileStorage } from "./json-file";

const adapters: Record<string, StorageAdapter> = {
  [jsonFileStorage.id]: jsonFileStorage,
};

/** Register additional adapters (SQLite, Postgres…) here. */
export function registerStorageAdapter(a: StorageAdapter) {
  adapters[a.id] = a;
}

export function getStorage(): StorageAdapter {
  const id = process.env.STORAGE_ADAPTER || jsonFileStorage.id;
  const adapter = adapters[id];
  if (!adapter) throw new Error(`Unknown storage adapter "${id}". Registered: ${Object.keys(adapters).join(", ")}`);
  return adapter;
}

export type { StorageAdapter } from "./types";
