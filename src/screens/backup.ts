import { adoptCode, backupCode, backupNow, backupStatus, confirmCode, restoreFromCode } from '../backup';
import { busy, field, h, input, mount } from '../dom';
import { db } from '../db';
import { go } from '../router';
import { t } from '../strings/de';
import { isTestVault, lock, unlockTestVault } from '../vault';
import { unlockScreen } from './unlock';

const when = (iso: string) => new Date(iso).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
const WEEK = 7 * 86_400_000;

/** Warnings for the home screen: code not written down, or no backup in a week. */
export async function backupBanners(): Promise<HTMLElement[]> {
  const s = await backupStatus();
  const out: HTMLElement[] = [];
  if ((await db.entries.count()) === 0) return out;
  if (s.lastBackupAt && Date.now() - Date.parse(s.lastBackupAt) > WEEK) out.push(h('div', { class: 'banner danger' }, t.backup.bannerOld));
  if (!s.codeConfirmed) {
    out.push(h('div', { class: 'banner warn' }, t.backup.bannerCode, ' ', h('button', { class: 'link inline', onclick: () => go('/settings') }, t.backup.open)));
  }
  return out;
}

export async function backupCard(): Promise<HTMLElement> {
  const s = await backupStatus();
  const status = h('p', { class: 'hint' }, s.lastBackupAt ? t.backup.last(when(s.lastBackupAt)) : t.backup.never);
  const now = h('button', {}, t.backup.now) as HTMLButtonElement;
  now.addEventListener('click', async () => {
    try {
      const at = await busy(now, t.common.working, backupNow);
      status.textContent = `${t.backup.done} ${t.backup.last(when(at))}`;
    } catch {
      status.textContent = t.backup.failed;
    }
  });
  const codeBox = h('div', {});
  const show = h('button', {}, t.backup.showCode) as HTMLButtonElement;
  show.addEventListener('click', async () => {
    const code = await backupCode();
    const confirmBtn = h('button', { class: 'primary small' }, t.backup.confirm) as HTMLButtonElement;
    confirmBtn.addEventListener('click', async () => {
      await confirmCode();
      confirmBtn.remove();
    });
    codeBox.replaceChildren(
      h('p', { class: 'hint' }, t.backup.codeHint),
      h('p', { class: 'code', translate: 'no' }, ...code.split('-').map((b) => h('span', {}, b))),
      h('div', { class: 'row' },
        h('button', { onclick: () => navigator.clipboard.writeText(code) }, t.recovery.copy),
        s.codeConfirmed ? null : confirmBtn,
      ),
    );
    show.remove();
  });
  return h('div', { class: 'card' }, h('h2', {}, t.backup.title), h('p', { class: 'hint' }, t.backup.hint), status, h('div', { class: 'row' }, now, show), codeBox);
}

export function restoreScreen(): void {
  const code = input({ autocomplete: 'off', autocapitalize: 'characters' });
  const err = h('p', { class: 'error', role: 'alert' });
  const btn = h('button', { type: 'submit', class: 'primary' }, t.backup.restoreSubmit) as HTMLButtonElement;
  const form = h('form', { class: 'card' }, h('h1', {}, t.backup.restoreTitle), h('p', { class: 'hint' }, t.backup.restoreHint), field(t.backup.restoreCode, code), err, btn);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if ((await db.entries.count()) > 0) return void (err.textContent = t.backup.restoreNotEmpty);
    let r: Awaited<ReturnType<typeof restoreFromCode>>;
    try {
      r = await busy(btn, t.common.working, () => restoreFromCode(code.value));
    } catch {
      return void (err.textContent = t.backup.restoreFailed);
    }
    if (r === 'badCode') return void (err.textContent = t.backup.restoreBadCode);
    if (r === 'notFound') return void (err.textContent = t.backup.restoreNotFound);
    const restored = r;
    lock();
    const finish = async () => {
      await adoptCode(code.value.trim().toUpperCase());
      sessionStorage.setItem('restored', t.backup.restored(restored.entries, when(restored.createdAt)));
      go('/', true);
      location.reload();
    };
    if (await isTestVault()) {
      await unlockTestVault();
      await finish();
    } else unlockScreen(() => void finish());
  });
  mount(h('header', { class: 'bar' }, h('button', { class: 'link', onclick: () => go('/') }, `← ${t.common.back}`)), form);
  code.focus();
}
