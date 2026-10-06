// All cryptography goes through the Web Crypto API. No homemade primitives.

export const PBKDF2_ITERATIONS = 600_000;

const enc = new TextEncoder();
const dec = new TextDecoder();

export interface Sealed {
  iv: Uint8Array;
  ct: Uint8Array;
}

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** Random AES-GCM 256 master key. Extractable only so it can be wrapped. */
export function generateMasterKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

/** The recovery key is 32 random bytes, used directly as an AES-GCM wrapping key. */
export function importRecoveryKey(raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['wrapKey', 'unwrapKey']);
}

export async function wrapMasterKey(master: CryptoKey, wrappingKey: CryptoKey): Promise<Sealed> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.wrapKey('raw', master, wrappingKey, { name: 'AES-GCM', iv });
  return { iv, ct: new Uint8Array(ct) };
}

/** Throws if the wrapping key is wrong (AES-GCM authentication fails). */
export function unwrapMasterKey(sealed: Sealed, wrappingKey: CryptoKey, extractable = false): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    'raw',
    toBuf(sealed.ct),
    wrappingKey,
    { name: 'AES-GCM', iv: toBuf(sealed.iv) },
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptJson(key: CryptoKey, value: unknown, aad?: string): Promise<Sealed> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, ...(aad ? { additionalData: enc.encode(aad) } : {}) },
    key,
    enc.encode(JSON.stringify(value)),
  );
  return { iv, ct: new Uint8Array(ct) };
}

export async function decryptJson<T>(key: CryptoKey, sealed: Sealed, aad?: string): Promise<T> {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toBuf(sealed.iv), ...(aad ? { additionalData: enc.encode(aad) } : {}) },
    key,
    toBuf(sealed.ct),
  );
  return JSON.parse(dec.decode(pt)) as T;
}

// --- Recovery code formatting (Crockford base32, groups of 4) ---

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function encodeRecoveryCode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out.match(/.{1,4}/g)!.join('-');
}

export function decodeRecoveryCode(code: string): Uint8Array<ArrayBuffer> {
  const clean = code
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const v = B32.indexOf(ch);
    if (v < 0) throw new Error('invalid recovery code');
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
    value &= (1 << bits) - 1;
  }
  if (out.length !== 32) throw new Error('invalid recovery code');
  return new Uint8Array(out);
}

function toBuf(u: Uint8Array): Uint8Array<ArrayBuffer> {
  return u.buffer instanceof ArrayBuffer ? (u as Uint8Array<ArrayBuffer>) : new Uint8Array(u);
}
