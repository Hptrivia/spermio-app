// Patient-facing form. Separate page: no app data, no vault, nothing stored in the browser.
import './style.css';
import { h, mount } from './dom';
import { patientFields } from './fields';
import { buildForm, requiredMessage } from './forms';
import { fingerprint, sealForInbox } from './intake-crypto';
import { t } from './strings/de';
import { rpc } from './supabase';

const params = new URLSearchParams(location.hash.slice(1));
const inboxId = params.get('i') ?? '';
const expectedFp = params.get('f') ?? '';

function message(text: string, cls = 'card'): void {
  mount(h('main', { class: cls }, h('h1', {}, t.intake.title), h('p', {}, text)));
}

async function start(): Promise<void> {
  if (!/^[\w-]{16,64}$/.test(inboxId) || !expectedFp) return message(t.intake.badLink);
  let publicJwk: JsonWebKey | null;
  try {
    publicJwk = await rpc<JsonWebKey | null>('inbox_public_key', { p_id: inboxId });
  } catch {
    return message(t.intake.failed);
  }
  if (!publicJwk) return message(t.intake.badLink);
  if ((await fingerprint(publicJwk)) !== expectedFp) return message(t.intake.keyMismatch);

  const form = buildForm(patientFields, { insuranceType: 'statutory', services: [] });
  const consent = h('input', { type: 'checkbox' }) as HTMLInputElement;
  const err = h('p', { class: 'error', role: 'alert' });
  const btn = h('button', { type: 'submit', class: 'primary' }, t.intake.submit) as HTMLButtonElement;
  const el = h('form', { class: 'card' },
    form.el,
    h('details', { class: 'privacy' }, h('summary', {}, t.intake.privacyTitle), h('p', { class: 'hint' }, t.intake.privacyText)),
    h('label', { class: 'check' }, consent, h('span', {}, t.intake.consent)),
    err,
    btn,
  );
  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    const missing = form.missing();
    if (missing) return void (err.textContent = requiredMessage(missing));
    if (!consent.checked) return void (err.textContent = t.intake.consentMissing);
    btn.disabled = true;
    btn.textContent = t.intake.sending;
    try {
      const sealed = await sealForInbox(publicJwk, inboxId, { ...form.read(), privacyConsent: true, submittedAt: new Date().toISOString() });
      await rpc('submit_intake', { p_inbox_id: inboxId, p_ephemeral_public_key: sealed.ephemeral_public_key, p_iv: sealed.iv, p_ciphertext: sealed.ciphertext });
      message(t.intake.done);
    } catch {
      err.textContent = t.intake.failed;
      btn.disabled = false;
      btn.textContent = t.intake.submit;
    }
  });
  mount(h('header', { class: 'bar' }, h('span', { class: 'brand' }, t.intake.title)), h('p', { class: 'hint' }, t.intake.intro), el);
}

void start();
