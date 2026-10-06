import { describe, expect, it } from 'vitest';
import { fingerprint, generateInboxKeys, openSubmission, sealForInbox } from '../src/intake-crypto';

describe('intake encryption', () => {
  it('only the inbox owner can open a submission, bound to the inbox id', async () => {
    const midwife = await generateInboxKeys();
    const other = await generateInboxKeys();
    const sealed = await sealForInbox(midwife.publicJwk, 'inbox-1', { firstName: 'Anna' });
    expect(sealed.ciphertext).not.toContain('Anna');
    expect(await openSubmission(midwife.privateJwk, 'inbox-1', sealed)).toEqual({ firstName: 'Anna' });
    await expect(openSubmission(other.privateJwk, 'inbox-1', sealed)).rejects.toThrow();
    await expect(openSubmission(midwife.privateJwk, 'inbox-2', sealed)).rejects.toThrow();
  });

  it('fingerprints are stable and differ per key', async () => {
    const a = await generateInboxKeys();
    const b = await generateInboxKeys();
    expect(await fingerprint(a.publicJwk)).toBe(await fingerprint({ ...a.publicJwk }));
    expect(await fingerprint(a.publicJwk)).not.toBe(await fingerprint(b.publicJwk));
  });
});
