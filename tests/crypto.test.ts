import { describe, expect, it } from 'vitest';
import {
  decodeRecoveryCode,
  decryptJson,
  deriveKeyFromPassword,
  encodeRecoveryCode,
  encryptJson,
  generateMasterKey,
  randomBytes,
  unwrapMasterKey,
  wrapMasterKey,
} from '../src/crypto';

describe('crypto', () => {
  it('round-trips JSON and rejects tampering', async () => {
    const key = await generateMasterKey();
    const sealed = await encryptJson(key, { name: 'Anna' }, 'aad');
    expect(await decryptJson(key, sealed, 'aad')).toEqual({ name: 'Anna' });
    await expect(decryptJson(key, sealed, 'other')).rejects.toThrow();
    sealed.ct[0] ^= 1;
    await expect(decryptJson(key, sealed, 'aad')).rejects.toThrow();
  });

  it('wraps the master key with a password and rejects a wrong one', async () => {
    const master = await generateMasterKey();
    const salt = randomBytes(16);
    const wrapped = await wrapMasterKey(master, await deriveKeyFromPassword('richtig', salt, 1000));
    const unwrapped = await unwrapMasterKey(wrapped, await deriveKeyFromPassword('richtig', salt, 1000));
    const sealed = await encryptJson(master, 42);
    expect(await decryptJson(unwrapped, sealed)).toBe(42);
    await expect(unwrapMasterKey(wrapped, await deriveKeyFromPassword('falsch', salt, 1000))).rejects.toThrow();
  });

  it('encodes recovery codes reversibly and tolerates typos like O/0 and spaces', () => {
    for (let i = 0; i < 50; i++) {
      const raw = randomBytes(32);
      const code = encodeRecoveryCode(raw);
      expect(code).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{1,4})+$/);
      expect(decodeRecoveryCode(code)).toEqual(raw);
      expect(decodeRecoveryCode(code.toLowerCase().replace(/-/g, ' '))).toEqual(raw);
    }
    expect(() => decodeRecoveryCode('ABCD')).toThrow();
  });
});
