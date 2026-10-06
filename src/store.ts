import { decryptJson, encryptJson } from './crypto';
import { db, getMeta, setMeta, type StoredEntry } from './db';
import type { Entry, EntryType } from './types';
import { currentKey } from './vault';

const listeners = new Set<() => void>();
/** Called after every local change (used to schedule the automatic backup). */
export const onChange = (fn: () => void) => listeners.add(fn);
const changed = () => listeners.forEach((fn) => fn());

// AAD binds each ciphertext to its entry, so payloads can't be swapped between entries.
const aad = (e: Pick<StoredEntry, 'id' | 'type' | 'version'>) => `${e.id}|${e.type}|${e.version}`;

export async function deviceId(): Promise<string> {
  let id = await getMeta<string>('deviceId');
  if (!id) {
    id = crypto.randomUUID();
    await setMeta('deviceId', id);
  }
  return id;
}

/** Creates a new entry (version 1). */
export async function create<P>(type: EntryType, payload: P): Promise<Entry<P>> {
  const now = new Date().toISOString();
  return write<P>({ id: crypto.randomUUID(), type, version: 1, createdAt: now, updatedAt: now, deleted: false, payload });
}

/** Adds a new version of an existing entry. */
export async function update<P>(prev: Entry<P>, payload: P): Promise<Entry<P>> {
  return write<P>({ ...prev, version: prev.version + 1, updatedAt: new Date().toISOString(), deleted: false, payload });
}

/** Adds a tombstone version. */
export async function remove<P>(prev: Entry<P>): Promise<Entry<P>> {
  return write<P>({ ...prev, version: prev.version + 1, updatedAt: new Date().toISOString(), deleted: true });
}

async function write<P>(e: Omit<Entry<P>, 'deviceId'>): Promise<Entry<P>> {
  const full: Entry<P> = { ...e, deviceId: await deviceId() };
  const sealed = await encryptJson(currentKey(), full.payload, aad(full));
  await db.entries.add({
    id: full.id,
    type: full.type,
    version: full.version,
    createdAt: full.createdAt,
    updatedAt: full.updatedAt,
    deviceId: full.deviceId,
    deleted: full.deleted ? 1 : 0,
    iv: sealed.iv,
    ct: sealed.ct,
  });
  changed();
  return full;
}

/** Current (latest, non-deleted) entries of a type. */
export async function list<P>(type: EntryType): Promise<Entry<P>[]> {
  const rows = await db.entries.where('type').equals(type).toArray();
  const latest = latestById(rows).filter((r) => !r.deleted);
  return Promise.all(latest.map((r) => decrypt<P>(r)));
}

export async function get<P>(id: string): Promise<Entry<P> | undefined> {
  const rows = await db.entries.where('id').equals(id).toArray();
  const [latest] = latestById(rows);
  return latest && !latest.deleted ? decrypt<P>(latest) : undefined;
}

export async function counts(): Promise<Record<EntryType, number>> {
  const rows = latestById(await db.entries.toArray()).filter((r) => !r.deleted);
  const out = { patient: 0, careCase: 0, child: 0, visit: 0, invoice: 0, note: 0 };
  for (const r of rows) out[r.type]++;
  return out;
}

/** Merge rows from another device: union by (id, version). Never overwrites. Returns rows added. */
export async function mergeRows(rows: StoredEntry[]): Promise<number> {
  let added = 0;
  await db.transaction('rw', db.entries, async () => {
    for (const r of rows) {
      if (!(await db.entries.get([r.id, r.version]))) {
        await db.entries.add(r);
        added++;
      }
    }
  });
  if (added) changed();
  return added;
}

export function latestById(rows: StoredEntry[]): StoredEntry[] {
  const best = new Map<string, StoredEntry>();
  for (const r of rows) {
    const cur = best.get(r.id);
    if (!cur || newer(r, cur)) best.set(r.id, r);
  }
  return [...best.values()];
}

// Same version written on two devices: later timestamp wins, deviceId breaks exact ties.
function newer(a: StoredEntry, b: StoredEntry): boolean {
  if (a.version !== b.version) return a.version > b.version;
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt;
  return a.deviceId > b.deviceId;
}

async function decrypt<P>(r: StoredEntry): Promise<Entry<P>> {
  const payload = await decryptJson<P>(currentKey(), { iv: r.iv, ct: r.ct }, aad(r));
  return { id: r.id, type: r.type, version: r.version, createdAt: r.createdAt, updatedAt: r.updatedAt, deviceId: r.deviceId, deleted: r.deleted === 1, payload };
}
