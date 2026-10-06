import Dexie, { type Table } from 'dexie';
import type { EntryType } from './types';

/** An entry as stored: metadata in the clear (needed for merging), payload encrypted. */
export interface StoredEntry {
  id: string;
  type: EntryType;
  version: number;
  createdAt: string;
  updatedAt: string;
  deviceId: string;
  deleted: 0 | 1;
  iv: Uint8Array;
  ct: Uint8Array;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

export class AppDB extends Dexie {
  entries!: Table<StoredEntry, [string, number]>;
  meta!: Table<MetaRow, string>;

  constructor(name = 'spermio') {
    super(name);
    this.version(1).stores({
      entries: '[id+version], id, type, updatedAt',
      meta: 'key',
    });
  }
}

export let db = new AppDB();

/** Tests use a fresh database per run. */
export function useDatabase(name: string): AppDB {
  db = new AppDB(name);
  return db;
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}
