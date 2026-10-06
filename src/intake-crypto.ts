// Patient → midwife encryption. The patient's browser makes a one-off ECDH key pair,
// combines it with the midwife's public key, and encrypts the form with AES-GCM.
// Only the midwife's private key (which never leaves her device) can decrypt it.

const enc = new TextEncoder();
const dec = new TextDecoder();
const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const;
const INFO = enc.encode('spermio-intake-v1');

export interface SealedSubmission {
  ephemeral_public_key: JsonWebKey;
  iv: string;
  ciphertext: string;
}

export const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
export const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (u: Uint8Array) => b64(u).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function generateInboxKeys(): Promise<{ publicJwk: JsonWebKey; privateJwk: JsonWebKey }> {
  const kp = await crypto.subtle.generateKey(ECDH, true, ['deriveBits']);
  return {
    publicJwk: await crypto.subtle.exportKey('jwk', kp.publicKey),
    privateJwk: await crypto.subtle.exportKey('jwk', kp.privateKey),
  };
}

/** Short fingerprint of the public key, put in the link so a swapped key on the server is detected. */
export async function fingerprint(jwk: JsonWebKey): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(`${jwk.crv}.${jwk.x}.${jwk.y}`));
  return b64url(new Uint8Array(hash).slice(0, 12));
}

async function aesKey(privateKey: CryptoKey, publicKey: CryptoKey): Promise<CryptoKey> {
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256);
  const hkdf = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(16), info: INFO }, hkdf, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function sealForInbox(publicJwk: JsonWebKey, inboxId: string, payload: unknown): Promise<SealedSubmission> {
  const recipient = await crypto.subtle.importKey('jwk', publicJwk, ECDH, false, []);
  const eph = await crypto.subtle.generateKey(ECDH, true, ['deriveBits']);
  const key = await aesKey(eph.privateKey, recipient);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(inboxId) }, key, enc.encode(JSON.stringify(payload)));
  const ephJwk = await crypto.subtle.exportKey('jwk', eph.publicKey);
  return { ephemeral_public_key: { kty: ephJwk.kty, crv: ephJwk.crv, x: ephJwk.x, y: ephJwk.y }, iv: b64(iv), ciphertext: b64(new Uint8Array(ct)) };
}

export async function openSubmission<T>(privateJwk: JsonWebKey, inboxId: string, s: SealedSubmission): Promise<T> {
  const priv = await crypto.subtle.importKey('jwk', privateJwk, ECDH, false, ['deriveBits']);
  const eph = await crypto.subtle.importKey('jwk', s.ephemeral_public_key, ECDH, false, []);
  const key = await aesKey(priv, eph);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(s.iv), additionalData: enc.encode(inboxId) }, key, unb64(s.ciphertext));
  return JSON.parse(dec.decode(pt)) as T;
}
