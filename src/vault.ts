import {
  PBKDF2_ITERATIONS,
  decodeRecoveryCode,
  deriveKeyFromPassword,
  encodeRecoveryCode,
  generateMasterKey,
  importRecoveryKey,
  randomBytes,
  unwrapMasterKey,
  wrapMasterKey,
  type Sealed,
} from './crypto';
import { getMeta, setMeta } from './db';

/**
 * The vault holds the master data key, wrapped twice:
 * by a key derived from the app password, and by the random recovery key.
 * Only wrapped copies are ever stored; the unwrapped key lives in memory while unlocked.
 */
interface VaultRecord {
  formatVersion: 1;
  salt: Uint8Array;
  iterations: number;
  byPassword: Sealed;
  byRecovery: Sealed;
  createdAt: string;
}

const VAULT = 'vault';
let sessionKey: CryptoKey | null = null;

export async function hasVault(): Promise<boolean> {
  return (await getMeta<VaultRecord>(VAULT)) !== undefined;
}

export function isUnlocked(): boolean {
  return sessionKey !== null;
}

export function currentKey(): CryptoKey {
  if (!sessionKey) throw new Error('locked');
  return sessionKey;
}

export function lock(): void {
  sessionKey = null;
}

/**
 * Prepares a new vault in memory. Nothing is saved until commit() is called,
 * which happens only after the user has confirmed she saved the recovery code.
 */
export async function prepareVault(password: string): Promise<{ recoveryCode: string; commit: () => Promise<void> }> {
  const master = await generateMasterKey();
  const recoveryRaw = randomBytes(32);
  const salt = randomBytes(16);
  const record: VaultRecord = {
    formatVersion: 1,
    salt,
    iterations: PBKDF2_ITERATIONS,
    byPassword: await wrapMasterKey(master, await deriveKeyFromPassword(password, salt)),
    byRecovery: await wrapMasterKey(master, await importRecoveryKey(recoveryRaw)),
    createdAt: new Date().toISOString(),
  };
  return {
    recoveryCode: encodeRecoveryCode(recoveryRaw),
    commit: async () => {
      await setMeta(VAULT, record);
      sessionKey = await reimportNonExtractable(master);
    },
  };
}

export async function createVault(password: string): Promise<string> {
  const { recoveryCode, commit } = await prepareVault(password);
  await commit();
  return recoveryCode;
}

/** Returns false on a wrong password. */
export async function unlockWithPassword(password: string): Promise<boolean> {
  const v = await loadVault();
  try {
    const kek = await deriveKeyFromPassword(password, toBuf(v.salt), v.iterations);
    sessionKey = await unwrapMasterKey(v.byPassword, kek);
    return true;
  } catch {
    return false;
  }
}

/** Unlocks with the recovery code and sets a new password. Returns false on a wrong code. */
export async function recoverWithCode(code: string, newPassword: string): Promise<boolean> {
  const v = await loadVault();
  let master: CryptoKey;
  try {
    master = await unwrapMasterKey(v.byRecovery, await importRecoveryKey(decodeRecoveryCode(code)), true);
  } catch {
    return false;
  }
  await rewrapPassword(v, master, newPassword);
  sessionKey = await reimportNonExtractable(master);
  return true;
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<boolean> {
  const v = await loadVault();
  let master: CryptoKey;
  try {
    master = await unwrapMasterKey(v.byPassword, await deriveKeyFromPassword(oldPassword, toBuf(v.salt), v.iterations), true);
  } catch {
    return false;
  }
  await rewrapPassword(v, master, newPassword);
  return true;
}

async function rewrapPassword(v: VaultRecord, master: CryptoKey, newPassword: string): Promise<void> {
  const salt = randomBytes(16);
  await setMeta(VAULT, {
    ...v,
    salt,
    iterations: PBKDF2_ITERATIONS,
    byPassword: await wrapMasterKey(master, await deriveKeyFromPassword(newPassword, salt)),
  } satisfies VaultRecord);
}

async function loadVault(): Promise<VaultRecord> {
  const v = await getMeta<VaultRecord>(VAULT);
  if (!v) throw new Error('no vault');
  return v;
}

async function reimportNonExtractable(master: CryptoKey): Promise<CryptoKey> {
  const raw = await crypto.subtle.exportKey('raw', master);
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

function toBuf(u: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(u);
}
