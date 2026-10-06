import { decryptJson, encryptJson, randomBytes, type Sealed } from './crypto';
import { getMeta, setMeta } from './db';
import { b64, fingerprint, generateInboxKeys, openSubmission, type SealedSubmission } from './intake-crypto';
import * as store from './store';
import { rpc } from './supabase';
import type { PatientPayload } from './types';
import { currentKey } from './vault';

/** Stored locally: public parts in the clear, private key + mailbox secret encrypted with the master key. */
interface InboxRecord {
  id: string;
  publicJwk: JsonWebKey;
  sealedSecrets: Sealed;
}
interface Secrets {
  privateJwk: JsonWebKey;
  secret: string;
}

const urlSafe = (u: Uint8Array) => b64(u).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function ensureInbox(): Promise<InboxRecord> {
  const existing = await getMeta<InboxRecord>('inbox');
  if (existing) return existing;
  const { publicJwk, privateJwk } = await generateInboxKeys();
  const id = urlSafe(randomBytes(18));
  const secret = urlSafe(randomBytes(32));
  await rpc('register_inbox', { p_id: id, p_public_key: publicJwk, p_secret: secret });
  const record: InboxRecord = { id, publicJwk, sealedSecrets: await encryptJson(currentKey(), { privateJwk, secret } satisfies Secrets, 'inbox') };
  await setMeta('inbox', record);
  return record;
}

/** Link for patients. Inbox id and key fingerprint sit after '#', so they never reach a server log. */
export async function intakeLink(): Promise<string> {
  const inbox = await ensureInbox();
  const base = new URL('intake.html', location.href.split('#')[0]);
  return `${base.href}#i=${inbox.id}&f=${await fingerprint(inbox.publicJwk)}`;
}

interface Row extends SealedSubmission {
  id: string;
  created_at: string;
}

/**
 * Downloads new submissions, decrypts them, saves each as a "Neu" patient on this device,
 * then deletes it from the server. Returns how many were imported.
 */
export async function fetchIntake(): Promise<number> {
  const inbox = await getMeta<InboxRecord>('inbox');
  if (!inbox) return 0;
  const { privateJwk, secret } = await decryptJson<Secrets>(currentKey(), inbox.sealedSecrets, 'inbox');
  const rows = await rpc<Row[]>('list_intake', { p_inbox_id: inbox.id, p_secret: secret });
  let imported = 0;
  for (const row of rows) {
    let form: Partial<PatientPayload>;
    try {
      form = await openSubmission<Partial<PatientPayload>>(privateJwk, inbox.id, row);
    } catch {
      continue; // Not decryptable (tampered or wrong key): leave it; the server deletes it after 14 days.
    }
    await store.create<PatientPayload>('patient', {
      ...sanitize(form),
      status: 'pending',
      intakeReceivedAt: row.created_at,
    } as PatientPayload);
    await rpc('delete_intake', { p_inbox_id: inbox.id, p_secret: secret, p_id: row.id });
    imported++;
  }
  return imported;
}

/** Keep only expected fields, as plain strings, from untrusted form data. */
function sanitize(f: Partial<PatientPayload>): Partial<PatientPayload> {
  const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');
  const a = (f.address ?? {}) as Partial<PatientPayload['address']>;
  return {
    firstName: str(f.firstName),
    lastName: str(f.lastName),
    dateOfBirth: str(f.dateOfBirth, 10),
    address: { street: str(a.street), postcode: str(a.postcode, 10), city: str(a.city) },
    phone: str(f.phone, 40),
    email: str(f.email),
    insuranceType: f.insuranceType === 'private' ? 'private' : 'statutory',
    insurerName: str(f.insurerName),
    insuranceNumber: str(f.insuranceNumber, 40),
    dueDate: str(f.dueDate, 10),
    services: Array.isArray(f.services) ? f.services.filter((s): s is string => typeof s === 'string').slice(0, 10) : [],
    preferredContact: (['phone', 'email', 'sms'] as const).find((c) => c === f.preferredContact) ?? 'phone',
    message: str(f.message, 2000),
    privacyConsent: f.privacyConsent === true,
  };
}
