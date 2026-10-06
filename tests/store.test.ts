import { beforeEach, describe, expect, it } from 'vitest';
import { useDatabase } from '../src/db';
import * as store from '../src/store';
import { createVault, lock, recoverWithCode, unlockWithPassword, changePassword } from '../src/vault';

let n = 0;
beforeEach(() => {
  lock();
  useDatabase(`test-${n++}`);
});

describe('vault', () => {
  it('unlocks with password, recovery code, and after a password change', async () => {
    const code = await createVault('erstes-passwort');
    await store.create('patient', { firstName: 'Anna' });
    lock();
    expect(await unlockWithPassword('falsch')).toBe(false);
    expect(await unlockWithPassword('erstes-passwort')).toBe(true);
    expect((await store.list<{ firstName: string }>('patient'))[0].payload.firstName).toBe('Anna');

    lock();
    expect(await recoverWithCode(code, 'neues-passwort')).toBe(true);
    lock();
    expect(await unlockWithPassword('erstes-passwort')).toBe(false);
    expect(await unlockWithPassword('neues-passwort')).toBe(true);

    expect(await changePassword('neues-passwort', 'drittes')).toBe(true);
    lock();
    expect(await unlockWithPassword('drittes')).toBe(true);
    expect(await store.list('patient')).toHaveLength(1);
  }, 60_000);
});

describe('store', () => {
  beforeEach(async () => {
    await createVault('pw');
  }, 30_000);

  it('keeps versions, returns the latest, and hides tombstones', async () => {
    const a = await store.create('patient', { v: 1 });
    const a2 = await store.update(a, { v: 2 });
    expect((await store.get<{ v: number }>(a.id))!.payload.v).toBe(2);
    await store.remove(a2);
    expect(await store.get(a.id)).toBeUndefined();
    expect(await store.list('patient')).toHaveLength(0);
  });

  it('merges two devices by union: latest version wins, re-merging is a no-op', async () => {
    const dbs = await import('../src/db');
    const phone = dbs.db;
    const a = await store.create('patient', { v: 'phone-v1' });
    const b = await store.create('patient', { v: 'only-on-phone' });

    // Second device with the same vault (as after restoring a backup), then diverge.
    const laptop = dbs.useDatabase(`laptop-${n++}`);
    await laptop.meta.bulkPut(await phone.meta.toArray());
    await laptop.meta.delete('deviceId');
    expect(await store.mergeRows(await phone.entries.toArray())).toBe(2);
    await store.update(a, { v: 'laptop-v2' });
    await store.create('patient', { v: 'only-on-laptop' });

    // Back to the phone: it deleted b meanwhile, then merges the laptop's rows.
    dbs.useDatabase(phone.name);
    await store.remove(b);
    expect(await store.mergeRows(await laptop.entries.toArray())).toBe(2);
    expect(await store.mergeRows(await laptop.entries.toArray())).toBe(0);
    const vs = (await store.list<{ v: string }>('patient')).map((e) => e.payload.v).sort();
    expect(vs).toEqual(['laptop-v2', 'only-on-laptop']);
  });
});
