import { loadDemoData } from '../demo';
import { busy, field, h, input, mount } from '../dom';
import { diagnosticsReport } from '../diagnostics';
import { db } from '../db';
import { shareOrDownload } from '../platform';
import * as store from '../store';
import { t } from '../strings/de';
import { go } from '../router';
import type { ChildPayload, PatientPayload, VisitPayload } from '../types';
import { changePassword } from '../vault';

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
  const demoBtn = h('button', { class: 'subtle' }, t.home.loadDemo) as HTMLButtonElement;
  demoBtn.addEventListener('click', async () => {
    const n = await busy(demoBtn, t.common.working, loadDemoData);
    await homeScreen(ctx);
    document.querySelector('.notice')!.textContent = t.home.demoLoaded(n);
  });

  mount(
    header(ctx),
    banners(ctx),
    h('main', {},
      h('div', { class: 'title-row' },
        h('h1', {}, t.home.patients),
        h('button', { class: 'primary small', onclick: () => go('/p/new') }, t.patient.add),
      ),
      msg,
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
      demoBtn,
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

export function settingsScreen(ctx: Ctx): void {
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
      h('div', { class: 'card' },
        h('h2', {}, t.settings.diagnostics),
        h('p', { class: 'hint' }, t.settings.diagnosticsHint),
        h('button', { onclick: async () => shareOrDownload('diagnose.json', await diagnosticsReport(), 'application/json') }, t.settings.diagnostics),
      ),
      wipeForm,
    ),
  );
}
