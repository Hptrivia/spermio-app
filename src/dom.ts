// Tiny element builder. Text is always set as text, never as HTML,
// because patient-submitted data will be rendered with it.
type Child = Node | string | null | undefined | false;
type Attrs = Record<string, string | boolean | EventListener | undefined>;

export function h(tag: string, attrs: Attrs = {}, ...children: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

export function mount(...nodes: Child[]): void {
  const app = document.getElementById('app')!;
  app.replaceChildren(...(nodes.filter(Boolean) as (Node | string)[]));
  window.scrollTo(0, 0);
}

export function field(label: string, input: HTMLInputElement): HTMLElement {
  return h('label', { class: 'field' }, h('span', {}, label), input);
}

export function input(attrs: Attrs): HTMLInputElement {
  return h('input', attrs) as HTMLInputElement;
}

/** Runs an async action with the button disabled and a busy label. */
export async function busy<T>(btn: HTMLButtonElement, label: string, fn: () => Promise<T>): Promise<T> {
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = label;
  try {
    return await fn();
  } finally {
    btn.disabled = false;
    btn.textContent = old;
  }
}
