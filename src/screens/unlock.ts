import { busy, field, h, input, mount } from '../dom';
import { t } from '../strings/de';
import { recoverWithCode, unlockWithPassword } from '../vault';

export function unlockScreen(onUnlocked: () => void): void {
  const pw = input({ type: 'password', autocomplete: 'current-password', required: true });
  const err = h('p', { class: 'error', role: 'alert' });
  const btn = h('button', { type: 'submit', class: 'primary' }, t.unlock.submit) as HTMLButtonElement;
  const form = h('form', { class: 'card' },
    h('h1', {}, t.unlock.title),
    field(t.unlock.password, pw),
    err,
    btn,
    h('button', { type: 'button', class: 'link', onclick: () => recoverScreen(onUnlocked) }, t.unlock.forgot),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (await busy(btn, t.common.working, () => unlockWithPassword(pw.value))) onUnlocked();
    else {
      err.textContent = t.unlock.wrong;
      pw.select();
    }
  });
  mount(form);
  pw.focus();
}

function recoverScreen(onUnlocked: () => void): void {
  const code = input({ autocomplete: 'off', autocapitalize: 'characters', required: true });
  const pw = input({ type: 'password', autocomplete: 'new-password', required: true, minlength: '10' });
  const err = h('p', { class: 'error', role: 'alert' });
  const btn = h('button', { type: 'submit', class: 'primary' }, t.recover.submit) as HTMLButtonElement;
  const form = h('form', { class: 'card' },
    h('h1', {}, t.recover.title),
    field(t.recover.code, code),
    field(t.recover.newPassword, pw),
    err,
    btn,
    h('button', { type: 'button', class: 'link', onclick: () => unlockScreen(onUnlocked) }, t.common.back),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (pw.value.length < 10) return void (err.textContent = t.setup.tooShort);
    if (await busy(btn, t.common.working, () => recoverWithCode(code.value, pw.value))) onUnlocked();
    else err.textContent = t.recover.wrong;
  });
  mount(form);
  code.focus();
}
