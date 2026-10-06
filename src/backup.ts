import { decodeRecoveryCode, decryptJson, encodeRecoveryCode, encryptJson, randomBytes, type Sealed } from './crypto';
import { db, getMeta, setMeta, type MetaRow, type StoredEntry } from './db';
import { b64, unb64 } from './intake-crypto';
import { mergeRows, onChange } from './store';
import { rpc } from './supabase';
import { currentKey, isUnlocked } from './vault';

/**
 * Automatic encrypted backup.
 * A random 32-byte backup code is the only thing needed (plus the app password) to restore on a new phone:
 * it names the backup on the server, authorises access, and is the key of the outer encryption layer.
 * Inside, entries stay encrypted with the master key; the vault (wrapped master key) travels along.
 */

interface BackupState {
  sealedCode: Sealed;
  lastBackupAt?: string;
  dirty?: boolean;
  codeConfirmed?: boolean;
}

interface Blob {
  format: 1;
  createdAt: string;
  meta: MetaRow[];
  entries: StoredEntry[];
}

// Never copied to another device: they are per-device.
const LOCAL_ONLY_META = new Set(['deviceId', 'backup']);
const enc = new TextEncoder();
const dec = new TextDecoder();

async function codeKeys(raw: Uint8Array<ArrayBuffer>): Promise<{ id: string; secret: string; key: CryptoKey }> {
  const hkdf = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveBits', 'deriveKey']);
  const bits = (info: string) => crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(16), info: enc.encode(info) }, hkdf, 256);
  const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
  const key = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(16), info: enc.encode('spermio-backup-key') }, hkdf, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  return { id: hex(await bits('spermio-backup-id')).slice(0, 32), secret: hex(await bits('spermio-backup-secret')), key };
}

// JSON with Uint8Array support
const replacer = (_: string, v: unknown) => (v instanceof Uint8Array ? { $u8: b64(v) } : v);
const reviver = (_: string, v: unknown) => (v && typeof v === 'object' && '$u8' in v ? unb64((v as { $u8: string }).$u8) : v);

async function state(): Promise<BackupState> {
  let s = await getMeta<BackupState>('backup');
  if (!s) {
    s = { sealedCode: await encryptJson(currentKey(), encodeRecoveryCode(randomBytes(32)), 'backup'), dirty: true };
    await setMeta('backup', s);
  }
  return s;
}

export async function backupCode(): Promise<string> {
  return decryptJson<string>(currentKey(), (await state()).sealedCode, 'backup');
}

export async function backupStatus(): Promise<{ lastBackupAt?: string; codeConfirmed: boolean }> {
  const s = await getMeta<BackupState>('backup');
  return { lastBackupAt: s?.lastBackupAt, codeConfirmed: !!s?.codeConfirmed };
}

export async function confirmCode(): Promise<void> {
  await setMeta('backup', { ...(await state()), codeConfirmed: true });
}

async function download(id: string, secret: string, key: CryptoKey): Promise<{ blob: Blob; createdAt: string } | undefined> {
  const [row] = await rpc<{ data: string; created_at: string }[]>('get_backup', { p_id: id, p_secret: secret });
  if (!row) return undefined;
  const [iv, ct] = row.data.split('.').map(unb64);
  const blob = JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)), reviver) as Blob;
  return { blob, createdAt: row.created_at };
}

const sameVault = (a: unknown, b: unknown) => JSON.stringify(a, replacer) === JSON.stringify(b, replacer);

/**
 * Sync = pull the newest backup, merge it into this device (union by entry id + version,
 * so edits from another device are never overwritten), then upload the merged state.
 * Returns how many entries came in from elsewhere.
 */
export async function syncNow(): Promise<{ at: string; pulled: number }> {
  const s = await state();
  const { id, secret, key } = await codeKeys(decodeRecoveryCode(await backupCode()));

  let pulled = 0;
  const remote = await download(id, secret, key);
  if (remote) {
    const remoteMeta = new Map(remote.blob.meta.map((m) => [m.key, m.value]));
    // Only merge data encrypted with the same master key (same vault).
    if (sameVault(remoteMeta.get('vault'), await getMeta('vault'))) {
      pulled = await mergeRows(remote.blob.entries);
      for (const [k, v] of remoteMeta) {
        if (LOCAL_ONLY_META.has(k)) continue;
        const local = await getMeta<unknown>(k);
        if (local === undefined) await setMeta(k, v);
        else if (k === 'invoiceSeq') {
          // Keep the higher counter so two devices don't reuse invoice numbers.
          const a = local as { year: number; n: number }, b = v as { year: number; n: number };
          if (b.year > a.year || (b.year === a.year && b.n > a.n)) await setMeta(k, b);
        }
      }
    }
  }

  const blob: Blob = {
    format: 1,
    createdAt: new Date().toISOString(),
    meta: (await db.meta.toArray()).filter((m) => !LOCAL_ONLY_META.has(m.key)),
    entries: await db.entries.toArray(),
  };
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(blob, replacer)));
  const at = await rpc<string>('put_backup', { p_id: id, p_secret: secret, p_data: `${b64(iv)}.${b64(new Uint8Array(ct))}` });
  await setMeta('backup', { ...((await getMeta<BackupState>('backup')) ?? s), lastBackupAt: at, dirty: false });
  return { at, pulled };
}

export const backupNow = async () => (await syncNow()).at;

let started = false;
let timer: number | undefined;
let running = false;

/**
 * Syncs a few seconds after each change, every 3 minutes while the app is open, and when it comes back
 * to the foreground. If offline, it stays "dirty" and is retried. onPulled re-renders when data arrived.
 */
export function startAutoBackup(onPulled?: () => void): void {
  if (started) return;
  started = true;
  const run = async () => {
    if (!isUnlocked() || running) return;
    running = true;
    try {
      const { pulled } = await syncNow();
      if (pulled > 0) onPulled?.();
    } catch {
      /* offline – retried later */
    } finally {
      running = false;
    }
  };
  onChange(() => {
    clearTimeout(timer);
    void getMeta<BackupState>('backup').then((s) => s && setMeta('backup', { ...s, dirty: true }));
    timer = window.setTimeout(run, 5000);
  });
  setInterval(() => !document.hidden && void run(), 3 * 60_000);
  document.addEventListener('visibilitychange', () => !document.hidden && void run());
  void run();
}

/**
 * Restores onto an empty device: replaces the local vault, settings and entries with the backup's.
 * Afterwards the backup's password (or the built-in one in test mode) unlocks the data.
 */
export async function restoreFromCode(code: string): Promise<{ entries: number; createdAt: string } | 'notFound' | 'badCode'> {
  let raw: Uint8Array<ArrayBuffer>;
  try {
    raw = decodeRecoveryCode(code);
  } catch {
    return 'badCode';
  }
  const { id, secret, key } = await codeKeys(raw);
  const remote = await download(id, secret, key);
  if (!remote) return 'notFound';
  const blob = remote.blob;

  await db.transaction('rw', db.entries, db.meta, async () => {
    await db.entries.clear();
    const keep = (await db.meta.toArray()).filter((m) => m.key === 'deviceId');
    await db.meta.clear();
    await db.meta.bulkPut([...keep, ...blob.meta]);
    await db.entries.bulkPut(blob.entries);
  });
  // Same code keeps backing up to the same place from the new phone.
  return { entries: blob.entries.length, createdAt: blob.createdAt };
}

/** After a restore the code must be stored again, encrypted with the restored master key. */
export async function adoptCode(code: string): Promise<void> {
  await setMeta('backup', { sealedCode: await encryptJson(currentKey(), code, 'backup'), codeConfirmed: true, dirty: false, lastBackupAt: new Date().toISOString() } satisfies BackupState);
}
