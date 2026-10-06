import { h } from './dom';
import { t } from './strings/de';

// Declarative forms: a list of field definitions bound to dotted paths in a plain object.

type Opts = Record<string, string>;

export type FieldDef =
  | { section: string }
  | {
      key: string;
      label: string;
      type: 'text' | 'email' | 'tel' | 'date' | 'time' | 'number' | 'textarea' | 'select' | 'radio' | 'checks';
      options?: Opts;
      required?: boolean;
      step?: string;
      half?: boolean;
      showIf?: (values: Record<string, unknown>) => boolean;
    };

export interface Form {
  el: HTMLElement;
  read(): Record<string, unknown>;
  /** Re-evaluates showIf conditions; call after programmatic changes. */
  refresh(): void;
  /** Returns the first missing required field label, if any. */
  missing(): string | undefined;
}

export function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), obj);
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) o = (o[k] ??= {}) as Record<string, unknown>;
  o[keys[keys.length - 1]] = value;
}

export function buildForm(defs: FieldDef[], initial: unknown, onChange?: () => void): Form {
  const rows: { def: Extract<FieldDef, { key: string }>; wrap: HTMLElement; read: () => unknown }[] = [];
  const children: HTMLElement[] = [];
  let grid: HTMLElement | null = null;

  for (const def of defs) {
    if ('section' in def) {
      grid = null;
      children.push(h('h2', { class: 'section' }, def.section));
      continue;
    }
    const value = getPath(initial, def.key);
    const { control, read } = makeControl(def, value);
    const wrap = h('div', { class: `field${def.half ? ' half' : ''}` }, h('span', { class: 'label' }, def.label + (def.required ? ' *' : '')), control);
    rows.push({ def, wrap, read });
    if (def.half) {
      if (!grid) children.push((grid = h('div', { class: 'grid2' })));
      grid.append(wrap);
    } else {
      grid = null;
      children.push(wrap);
    }
  }

  const el = h('div', { class: 'form' }, ...children);
  const read = () => {
    const out: Record<string, unknown> = structuredClone((initial ?? {}) as Record<string, unknown>);
    for (const r of rows) setPath(out, r.def.key, r.read());
    return out;
  };
  const refresh = () => {
    const v = read();
    for (const r of rows) r.wrap.hidden = r.def.showIf ? !r.def.showIf(v) : false;
  };
  el.addEventListener('input', () => {
    refresh();
    onChange?.();
  });
  el.addEventListener('change', () => {
    refresh();
    onChange?.();
  });
  refresh();

  return {
    el,
    read,
    refresh,
    missing: () => {
      for (const r of rows) {
        if (!r.def.required || r.wrap.hidden) continue;
        const v = r.read();
        if (v === '' || v === undefined || (Array.isArray(v) && v.length === 0)) return r.def.label;
      }
      return undefined;
    },
  };
}

function makeControl(def: Extract<FieldDef, { key: string }>, value: unknown): { control: HTMLElement; read: () => unknown } {
  const name = `f-${def.key}-${Math.random().toString(36).slice(2, 7)}`;
  switch (def.type) {
    case 'textarea': {
      const ta = h('textarea', { rows: '4' }) as HTMLTextAreaElement;
      ta.value = (value as string) ?? '';
      return { control: ta, read: () => ta.value.trim() };
    }
    case 'select': {
      const sel = h('select', {}, h('option', { value: '' }, '–'), ...Object.entries(def.options!).map(([v, l]) => h('option', { value: v }, l))) as HTMLSelectElement;
      sel.value = (value as string) ?? '';
      return { control: sel, read: () => sel.value || undefined };
    }
    case 'radio': {
      const box = h('div', { class: 'choices' });
      for (const [v, l] of Object.entries(def.options!)) {
        const inp = h('input', { type: 'radio', name, value: v, checked: value === v }) as HTMLInputElement;
        box.append(h('label', { class: 'chip' }, inp, h('span', {}, l)));
      }
      return { control: box, read: () => (box.querySelector('input:checked') as HTMLInputElement | null)?.value };
    }
    case 'checks': {
      const box = h('div', { class: 'choices' });
      const selected = new Set((value as string[]) ?? []);
      for (const [v, l] of Object.entries(def.options!)) {
        const inp = h('input', { type: 'checkbox', value: v, checked: selected.has(v) }) as HTMLInputElement;
        box.append(h('label', { class: 'chip' }, inp, h('span', {}, l)));
      }
      return { control: box, read: () => [...box.querySelectorAll<HTMLInputElement>('input:checked')].map((i) => i.value) };
    }
    case 'number': {
      const inp = h('input', { type: 'number', inputmode: 'decimal', step: def.step ?? 'any' }) as HTMLInputElement;
      inp.value = value == null ? '' : String(value);
      return { control: inp, read: () => (inp.value === '' ? undefined : Number(inp.value)) };
    }
    default: {
      const inp = h('input', { type: def.type, autocomplete: 'off' }) as HTMLInputElement;
      inp.value = (value as string) ?? '';
      return { control: inp, read: () => inp.value.trim() };
    }
  }
}

export const requiredMessage = (label: string) => `${t.fields.required}: ${label}`;
