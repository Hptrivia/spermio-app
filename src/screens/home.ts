import { loadDemoData, removeDemoData } from '../demo';
import { busy, field, h, input, mount } from '../dom';
import { diagnosticsReport } from '../diagnostics';
import { db } from '../db';
import { shareOrDownload } from '../platform';
import * as store from '../store';
import { t } from '../strings/de';
import { go } from '../router';
import { fetchIntake, intakeLink } from '../inbox';
import type { ChildPayload, PatientPayload, VisitPayload } from '../types';
import { changePassword } from '../vault';
import { buildForm, type FieldDef } from '../forms';
import { getPractice, savePractice, type Practice } from '../practice';

export interface Ctx {
  onLock: () => void;
  persistDenied: boolean;
  testVault: boolean;
}

const fmtDate = (d: string) => new Date(d + 'T00:00').toLocaleDateString('de-DE');

export async function homeScreen(ctx: Ctx): Promise<void> {
  const [patients, visits, children] = await Promise.all([
    store.list<PatientPayload>('patient'),
    store.list<VisitPayload>('visit'),
    store.list<ChildPayload>('child'),
  ]);
  const countFor = (rows: { payload: { patientId: string } }[], id: string) => rows.filter((r) => r.payload.patientId === id).length;
  const order = { pending: 0, active: 1, archived: 2 };
  patients.sort((a, b) => order[a.payload.status] - order[b.payload.status] || (a.payload.dueDate ?? '').localeCompare(b.payload.dueDate ?? ''));

  const msg = h('p', { class: 'notice', role: 'status' });

  mount(
    header(ctx),
    banners(ctx),
    h('main', {},
      h('div', { class: 'title-row' },
        h('h1', {}, t.home.patients),
        h('button', { class: 'primary small', onclick: () => go('/p/new') }, t.patient.add),
      ),
      msg,
      inboxCard(msg, ctx),
      patients.length === 0 ? h('p', { class: 'empty' }, t.home.empty) : null,
      h('ul', { class: 'list' },
        ...patients.map((p) =>
          h('li', { class: 'item tappable', onclick: () => go(`/p/${p.id}`) },
            h('div', { class: 'item-main' },
              h('strong', {}, `${p.payload.firstName} ${p.payload.lastName}`),
              h('span', { class: `badge ${p.payload.status}` }, t.home.statuses[p.payload.status]),
            ),
            h('div', { class: 'item-sub' },
              `${t.home.dueDate} ${p.payload.dueDate ? fmtDate(p.payload.dueDate) : '–'} · ${t.home.visits(countFor(visits, p.id))} · ${t.home.children(countFor(children, p.id))}`,
            ),
          ),
        ),
      ),
    ),
  );
}

function header(ctx: Ctx): HTMLElement {
  return h('header', { class: 'bar' },
    h('span', { class: 'brand' }, t.appName),
    h('div', {},
      h('button', { class: 'ghost', 'aria-label': t.settings.title, onclick: () => go('/settings') }, '⚙︎'),
      ctx.testVault ? null : h('button', { class: 'ghost', onclick: ctx.onLock }, t.common.lock),
    ),
  );
}

function banners(ctx: Ctx): HTMLElement | null {
  const items = [
    ctx.testVault ? h('div', { class: 'banner warn' }, t.testMode.banner) : null,
    ctx.persistDenied ? h('div', { class: 'banner warn' }, t.persist.denied) : null,
  ].filter(Boolean) as HTMLElement[];
  return items.length ? h('div', {}, ...items) : null;
}

export async function settingsScreen(ctx: Ctx): Promise<void> {
  const practiceEl = await practiceCard();
  const oldPw = input({ type: 'password', autocomplete: 'current-password' });
  const newPw = input({ type: 'password', autocomplete: 'new-password' });
  const pwMsg = h('p', { role: 'status' });
  const pwBtn = h('button', { type: 'submit' }, t.settings.changePassword) as HTMLButtonElement;
  const pwForm = h('form', { class: 'card' }, h('h2', {}, t.settings.changePassword), field(t.settings.oldPassword, oldPw), field(t.settings.newPassword, newPw), pwMsg, pwBtn);
  pwForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (newPw.value.length < 10) return void (pwMsg.textContent = t.setup.tooShort);
    const ok = await busy(pwBtn, t.common.working, () => changePassword(oldPw.value, newPw.value));
    pwMsg.textContent = ok ? t.settings.passwordChanged : t.settings.wrongPassword;
    if (ok) (pwForm as HTMLFormElement).reset();
  });

  const wipeInput = input({ autocomplete: 'off' });
  const wipeBtn = h('button', { class: 'danger', type: 'submit' }, t.settings.wipe);
  const wipeForm = h('form', { class: 'card' }, h('h2', {}, t.settings.wipe), field(t.settings.wipeConfirm, wipeInput), wipeBtn);
  wipeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (wipeInput.value.trim() !== t.settings.wipeWord) return;
    await db.delete();
    location.reload();
  });

  mount(
    header(ctx),
    h('main', {},
      h('button', { class: 'link', onclick: () => go('/') }, `← ${t.common.back}`),
      h('h1', {}, t.settings.title),
      ctx.testVault ? null : h('p', { class: 'hint' }, t.settings.autoLock),
      ctx.testVault ? null : pwForm,
      practiceEl,
      demoCard(),
      h('div', { class: 'card' },
        h('h2', {}, t.settings.diagnostics),
        h('p', { class: 'hint' }, t.settings.diagnosticsHint),
        h('button', { onclick: async () => shareOrDownload('diagnose.json', await diagnosticsReport(), 'application/json') }, t.settings.diagnostics),
      ),
      wipeForm,
    ),
  );
}

function demoCard(): HTMLElement {
  const msg = h('p', { class: 'notice', role: 'status' });
  const load = h('button', {}, t.home.loadDemo) as HTMLButtonElement;
  const remove = h('button', {}, t.home.removeDemo) as HTMLButtonElement;
  load.addEventListener('click', async () => (msg.textContent = t.home.demoLoaded(await busy(load, t.common.working, loadDemoData))));
  remove.addEventListener('click', async () => (msg.textContent = t.home.demoRemoved(await busy(remove, t.common.working, removeDemoData))));
  return h('div', { class: 'card' }, h('h2', {}, t.home.demoTitle), h('p', { class: 'hint' }, t.home.demoHint), h('div', { class: 'row' }, load, remove), msg);
}

async function practiceCard(): Promise<HTMLElement> {
  const f = t.fields;
  const p = t.practice;
  const defs: FieldDef[] = [
    { key: 'name', label: p.name, type: 'text' },
    { key: 'street', label: f.street, type: 'text' },
    { key: 'postcode', label: f.postcode, type: 'text', half: true },
    { key: 'city', label: f.city, type: 'text', half: true },
    { key: 'phone', label: f.phone, type: 'tel', half: true },
    { key: 'email', label: f.email, type: 'email', half: true },
    { key: 'ik', label: p.ik, type: 'text' },
    { key: 'iban', label: p.iban, type: 'text', half: true },
    { key: 'bank', label: p.bank, type: 'text', half: true },
    { key: 'taxNote', label: p.taxNote, type: 'textarea' },
  ];
  const form = buildForm(defs, await getPractice());
  const msg = h('p', { class: 'notice', role: 'status' });
  const el = h('form', { class: 'card' }, h('h2', {}, p.title), form.el, msg, h('button', { type: 'submit' }, t.common.save));
  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    await savePractice(form.read() as unknown as Practice);
    msg.textContent = p.saved;
  });
  return el;
}

let autoFetched = false;

function inboxCard(msg: HTMLElement, ctx: Ctx): HTMLElement {
  const share = h('button', {}, t.inbox.share) as HTMLButtonElement;
  const check = h('button', {}, t.inbox.check) as HTMLButtonElement;
  share.addEventListener('click', async () => {
    const link = await busy(share, t.common.working, intakeLink);
    if (navigator.share) {
      try {
        await navigator.share({ title: t.intake.title, url: link });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    await navigator.clipboard.writeText(link);
    msg.textContent = t.inbox.copied;
  });
  const pull = async () => {
    try {
      const n = await fetchIntake();
      if (n > 0) await homeScreen(ctx);
      document.querySelector('.notice')!.textContent = t.inbox.imported(n);
    } catch {
      document.querySelector('.notice')!.textContent = t.inbox.offline;
    }
  };
  check.addEventListener('click', () => busy(check, t.common.working, pull));
  // Check once automatically when the app opens.
  if (!autoFetched) {
    autoFetched = true;
    void (async () => {
      const n = await fetchIntake();
      if (n === 0) return;
      await homeScreen(ctx);
      document.querySelector('.notice')!.textContent = t.inbox.imported(n);
    })().catch(() => {});
  }
  return h('div', { class: 'card inbox' }, h('h2', {}, t.inbox.title), h('p', { class: 'hint' }, t.inbox.hint), h('div', { class: 'row' }, share, check));
}
