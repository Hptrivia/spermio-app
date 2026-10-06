import { busy, field, h, input, mount } from '../dom';
import { isIOS } from '../platform';
import { t } from '../strings/de';
import { prepareVault } from '../vault';

export function installScreen(onTestAnyway: () => void): void {
  const steps = isIOS() ? t.install.iosSteps : t.install.otherSteps;
  mount(
    h('main', { class: 'card' },
      h('h1', {}, t.install.title),
      h('p', {}, t.install.intro),
      h('ol', { class: 'steps' }, ...steps.map((s) => h('li', {}, s))),
      h('button', { class: 'link', onclick: onTestAnyway }, t.install.testAnyway),
    ),
  );
}

export function setupScreen(onDone: () => void): void {
  const pw = input({ type: 'password', autocomplete: 'new-password', required: true });
  const pw2 = input({ type: 'password', autocomplete: 'new-password', required: true });
  const err = h('p', { class: 'error', role: 'alert' });
  const btn = h('button', { type: 'submit', class: 'primary' }, t.setup.create) as HTMLButtonElement;

  const form = h('form', { class: 'card' },
    h('h1', {}, t.setup.title),
    h('p', {}, t.setup.intro),
    field(t.setup.password, pw),
    field(t.setup.passwordRepeat, pw2),
    err,
    btn,
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (pw.value.length < 10) return void (err.textContent = t.setup.tooShort);
    if (pw.value !== pw2.value) return void (err.textContent = t.setup.mismatch);
    const vault = await busy(btn, t.common.working, () => prepareVault(pw.value));
    recoveryScreen(vault.recoveryCode, async () => {
      await vault.commit();
      onDone();
    });
  });
  mount(form);
  pw.focus();
}

function recoveryScreen(code: string, onConfirmed: () => Promise<void>): void {
  const blocks = code.split('-');
  const checkIndex = 2 + Math.floor(Math.random() * (blocks.length - 3)); // never the first/last block
  const check = h('input', { type: 'checkbox' }) as HTMLInputElement;
  const verify = input({ autocomplete: 'off', autocapitalize: 'characters', maxlength: '4', inputmode: 'text' });
  const err = h('p', { class: 'error', role: 'alert' });
  const btn = h('button', { type: 'submit', class: 'primary', disabled: true }, t.common.continue) as HTMLButtonElement;
  const copyBtn = h('button', { type: 'button' }, t.recovery.copy) as HTMLButtonElement;

  copyBtn.addEventListener('click', async () => {
    await navigator.clipboard.writeText(code);
    copyBtn.textContent = t.recovery.copied;
  });
  const refresh = () => (btn.disabled = !check.checked || verify.value.length < 4);
  check.addEventListener('change', refresh);
  verify.addEventListener('input', refresh);

  const form = h('form', { class: 'card' },
    h('h1', {}, t.recovery.title),
    h('p', {}, t.recovery.intro),
    h('p', { class: 'code', translate: 'no' }, ...blocks.map((b) => h('span', {}, b))),
    h('p', { class: 'hint' }, t.recovery.howTo),
    h('div', { class: 'row' }, copyBtn, h('button', { type: 'button', onclick: () => window.print() }, t.recovery.print)),
    h('label', { class: 'check' }, check, h('span', {}, t.recovery.confirmCheck)),
    field(t.recovery.verifyLabel(checkIndex + 1), verify),
    err,
    btn,
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (verify.value.trim().toUpperCase() !== blocks[checkIndex]) return void (err.textContent = t.recovery.verifyWrong);
    await busy(btn, t.common.working, onConfirmed);
  });
  mount(form);
}
