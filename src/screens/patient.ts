import { euro, minutesBetween, travelCost, unitsForContact } from '../billing';
import { h, mount } from '../dom';
import { childFields, noteFields, patientFields, patientStatusField, visitFields } from '../fields';
import { buildForm, requiredMessage, type Form } from '../forms';
import { go } from '../router';
import * as store from '../store';
import { t } from '../strings/de';
import { TARIFF, positionByCode, type Phase } from '../tariff';
import type { ChildPayload, Entry, NotePayload, PatientPayload, VisitPayload } from '../types';

const today = () => new Date().toISOString().slice(0, 10);
export const fmtDate = (d?: string) => (d ? new Date(d + 'T00:00').toLocaleDateString('de-DE') : '–');
const fullName = (p: PatientPayload) => `${p.firstName} ${p.lastName}`;

function topBar(backTo: string, backLabel: string): HTMLElement {
  return h('header', { class: 'bar' }, h('button', { class: 'link', onclick: () => go(backTo) }, `← ${backLabel}`));
}

async function forPatient<P extends { patientId: string }>(type: 'visit' | 'child' | 'note', pid: string): Promise<Entry<P>[]> {
  return (await store.list<P>(type)).filter((e) => e.payload.patientId === pid);
}

// ---------- Patient file ----------

export async function patientScreen(pid: string): Promise<void> {
  const patient = await store.get<PatientPayload>(pid);
  if (!patient) return go('/', true);
  const p = patient.payload;
  const [visits, children, notes] = await Promise.all([
    forPatient<VisitPayload>('visit', pid),
    forPatient<ChildPayload>('child', pid),
    forPatient<NotePayload>('note', pid),
  ]);
  const childName = new Map(children.map((c) => [c.id, c.payload.name]));

  type Item = { date: string; sort: string; el: HTMLElement };
  const items: Item[] = [
    ...visits.map((v) => ({ date: v.payload.date, sort: v.payload.date + v.payload.startTime, el: visitItem(pid, v, childName) })),
    ...children.map((c) => ({
      date: c.payload.birthDate,
      sort: c.payload.birthDate + (c.payload.birthTime ?? ''),
      el: timelineItem(`/p/${pid}/child/${c.id}`, 'child', `${t.patient.born}: ${c.payload.name}`, c.payload.birthDate,
        [c.payload.birthTime, c.payload.birthWeightG && `${c.payload.birthWeightG} g`, c.payload.lengthCm && `${c.payload.lengthCm} cm`].filter(Boolean).join(' · ')),
    })),
    ...notes.map((n) => ({
      date: n.payload.date,
      sort: n.payload.date + n.createdAt,
      el: timelineItem(`/p/${pid}/note/${n.id}`, 'note', t.patient.note, n.payload.date, n.payload.text),
    })),
  ].sort((a, b) => b.sort.localeCompare(a.sort));

  const info = (label: string, value: string | undefined) => (value ? h('div', { class: 'info-row' }, h('span', {}, label), h('span', {}, value)) : null);
  const addr = [p.address?.street, [p.address?.postcode, p.address?.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');

  mount(
    topBar('/', t.home.title),
    h('main', {},
      h('div', { class: 'title-row' },
        h('h1', {}, fullName(p)),
        h('span', { class: `badge ${p.status}` }, t.options.status[p.status]),
      ),
      h('div', { class: 'card info' },
        info(t.fields.dueDate, p.dueDate && fmtDate(p.dueDate)),
        info(t.fields.dateOfBirth, p.dateOfBirth && fmtDate(p.dateOfBirth)),
        info(t.fields.street, addr),
        info(t.fields.phone, p.phone),
        info(t.fields.email, p.email),
        info(t.patient.insurance, [p.insuranceType && t.options.insuranceType[p.insuranceType], p.insurerName, p.insuranceNumber].filter(Boolean).join(' · ')),
        info(t.fields.services, (p.services ?? []).map((s) => t.options.services[s as keyof typeof t.options.services] ?? s).join(', ')),
        p.message ? h('p', { class: 'hint quote' }, p.message) : null,
        h('button', { class: 'link', onclick: () => go(`/p/${pid}/edit`) }, t.patient.edit),
      ),
      h('div', { class: 'row actions' },
        h('button', { class: 'primary', onclick: () => go(`/p/${pid}/visit/new`) }, t.patient.addVisit),
        h('button', { onclick: () => go(`/p/${pid}/child/new`) }, t.patient.addChild),
        h('button', { onclick: () => go(`/p/${pid}/note/new`) }, t.patient.addNote),
      ),
      h('h2', {}, t.patient.timeline),
      items.length ? h('ul', { class: 'list timeline' }, ...items.map((i) => i.el)) : h('p', { class: 'empty' }, t.patient.noEntries),
    ),
  );
}

function timelineItem(href: string, kind: string, title: string, date: string, sub: string): HTMLElement {
  return h('li', { class: `item tappable kind-${kind}`, onclick: () => go(href) },
    h('div', { class: 'item-main' }, h('strong', {}, title), h('span', { class: 'date' }, fmtDate(date))),
    sub ? h('div', { class: 'item-sub clamp' }, sub) : null,
  );
}

function visitItem(pid: string, v: Entry<VisitPayload>, childName: Map<string, string>): HTMLElement {
  const x = v.payload;
  const mins = minutesBetween(x.startTime, x.endTime);
  const who = t.options.seen[x.seen] + (x.seen !== 'mother' && x.childId && childName.get(x.childId) ? ` (${childName.get(x.childId)})` : '');
  const sub = [
    `${x.startTime}–${x.endTime} · ${mins} ${t.patient.minutes} · ${t.options.location[x.location]} · ${who}`,
    (x.billingCodes ?? []).join(', '),
    x.notes,
  ].filter(Boolean).join('\n');
  return timelineItem(`/p/${pid}/visit/${v.id}`, 'visit', `${t.patient.visit} · ${t.options.phase[x.phase]}`, x.date, sub);
}

// ---------- Patient create / edit ----------

export async function patientFormScreen(pid?: string): Promise<void> {
  const existing = pid ? await store.get<PatientPayload>(pid) : undefined;
  const initial: Partial<PatientPayload> = existing?.payload ?? { status: 'active', insuranceType: 'statutory', services: [], privacyConsent: false };
  const form = buildForm(existing ? [...patientFields, patientStatusField] : patientFields, initial);

  await formPage({
    title: existing ? t.patient.editTitle : t.patient.newTitle,
    back: existing ? `/p/${pid}` : '/',
    form,
    onSave: async () => {
      const data = form.read() as unknown as PatientPayload;
      const saved = existing ? await store.update(existing, data) : await store.create<PatientPayload>('patient', data);
      go(`/p/${saved.id}`, true);
    },
    onDelete: existing
      ? async () => {
          await store.remove(existing);
          go('/', true);
        }
      : undefined,
  });
}

// ---------- Visit / child / note create / edit ----------

export async function entryFormScreen(kind: 'visit' | 'child' | 'note', pid: string, eid?: string): Promise<void> {
  const patient = await store.get<PatientPayload>(pid);
  if (!patient) return go('/', true);
  const existing = eid ? await store.get<VisitPayload | ChildPayload | NotePayload>(eid) : undefined;
  const titles = { visit: t.visit, child: t.child, note: t.note }[kind];
  let form: Form;
  let extra: HTMLElement | null = null;

  if (kind === 'visit') {
    const children = await forPatient<ChildPayload>('child', pid);
    const lastVisit = (await forPatient<VisitPayload>('visit', pid)).sort((a, b) => b.payload.date.localeCompare(a.payload.date))[0];
    const initial: Partial<VisitPayload> = existing?.payload as VisitPayload ?? {
      date: today(),
      startTime: '',
      endTime: '',
      phase: lastVisit?.payload.phase ?? (children.length ? 'postpartum' : 'pregnancy'),
      location: 'home',
      seen: children.length ? 'both' : 'mother',
      childId: children[0]?.id,
      travelKm: lastVisit?.payload.travelKm,
      billingCodes: [],
    };
    const billing = billingPicker(initial.billingCodes ?? []);
    form = buildForm(visitFields(Object.fromEntries(children.map((c) => [c.id, c.payload.name]))), initial, () => billing.update(form.read() as unknown as VisitPayload));
    billing.update(form.read() as unknown as VisitPayload);
    extra = billing.el;
    const read = form.read;
    form.read = () => ({ ...read(), billingCodes: billing.selected() });
  } else {
    const initial = existing?.payload ?? (kind === 'child' ? { birthDate: today(), insurerName: patient.payload.insurerName } : { date: today() });
    form = buildForm(kind === 'child' ? childFields : noteFields, initial);
  }

  await formPage({
    title: existing ? titles.editTitle : titles.newTitle,
    subtitle: fullName(patient.payload),
    back: `/p/${pid}`,
    form,
    extra,
    validate: () => {
      if (kind !== 'visit') return undefined;
      const v = form.read() as unknown as VisitPayload;
      return minutesBetween(v.startTime, v.endTime) <= 0 ? t.visit.endBeforeStart : undefined;
    },
    onSave: async () => {
      const data = { ...form.read(), patientId: pid };
      if (existing) await store.update(existing, data);
      else await store.create(kind, data);
      go(`/p/${pid}`, true);
    },
    onDelete: existing
      ? async () => {
          await store.remove(existing);
          go(`/p/${pid}`, true);
        }
      : undefined,
  });
}

/** Billing positions for the visit's phase, with live unit + amount preview. */
function billingPicker(initial: string[]) {
  const chosen = new Set(initial);
  const box = h('div', { class: 'positions' });
  const total = h('p', { class: 'total' });
  const el = h('div', {}, h('h2', { class: 'section' }, t.visit.billing, h('small', { class: 'sample' }, t.visit.sampleTariff)), box, total);
  let current: VisitPayload | undefined;

  const renderTotal = () => {
    const v = current!;
    const mins = minutesBetween(v.startTime, v.endTime);
    const sum = [...chosen].reduce((acc, code) => {
      const p = positionByCode(code);
      return p ? acc + unitsForContact(mins, p) * p.pricePerUnit : acc;
    }, 0);
    const km = v.location === 'home' ? (v.travelKm ?? 0) : 0;
    total.textContent = mins > 0 ? `${t.visit.duration}: ${mins} ${t.patient.minutes} · ${euro(sum)}${km ? ` + ${euro(travelCost(km))} (${km} ${t.patient.km})` : ''}` : '';
  };

  // Re-rendered when the visit's phase or times change; ticking a box only updates the total.
  let renderedFor = '';
  const update = (v: VisitPayload) => {
    current = v;
    const mins = minutesBetween(v.startTime, v.endTime);
    // Only rebuild when it matters, so a tap that follows leaving a text field isn't swallowed.
    const key = `${v.phase}|${mins}`;
    if (key === renderedFor) return renderTotal();
    renderedFor = key;
    const positions = TARIFF.positions.filter((p) => p.phases.includes(v.phase as Phase) || chosen.has(p.code));
    box.replaceChildren(
      ...(positions.length
        ? positions.map((p) => {
            const units = unitsForContact(mins, p);
            const cb = h('input', { type: 'checkbox', checked: chosen.has(p.code) }) as HTMLInputElement;
            cb.addEventListener('change', () => {
              if (cb.checked) chosen.add(p.code);
              else chosen.delete(p.code);
              renderTotal();
            });
            return h('label', { class: 'position' },
              cb,
              h('span', { class: 'pos-label' }, h('strong', {}, p.code), ' ', p.label),
              mins > 0 ? h('span', { class: 'pos-amount' }, `${units} × ${euro(p.pricePerUnit)} = ${euro(units * p.pricePerUnit)}`) : null,
            );
          })
        : [h('p', { class: 'hint' }, t.visit.noPositions)]),
    );
    renderTotal();
  };
  return { el, update, selected: () => [...chosen] };
}

// ---------- Shared form page ----------

async function formPage(opts: {
  title: string;
  subtitle?: string;
  back: string;
  form: Form;
  extra?: HTMLElement | null;
  validate?: () => string | undefined;
  onSave: () => Promise<void>;
  onDelete?: () => Promise<void>;
}): Promise<void> {
  const err = h('p', { class: 'error', role: 'alert' });
  const save = h('button', { type: 'submit', class: 'primary' }, t.common.save) as HTMLButtonElement;
  const el = h('form', { class: 'card' }, opts.form.el, opts.extra ?? null, err, save,
    opts.onDelete ? h('button', { type: 'button', class: 'link danger-link', onclick: async () => confirm(t.patient.deleteConfirm) && opts.onDelete!() }, t.patient.delete) : null,
  );
  el.addEventListener('submit', async (e) => {
    e.preventDefault();
    const missing = opts.form.missing();
    const problem = missing ? requiredMessage(missing) : opts.validate?.();
    if (problem) {
      err.textContent = problem;
      return;
    }
    save.disabled = true;
    try {
      await opts.onSave();
    } finally {
      save.disabled = false;
    }
  });
  mount(
    topBar(opts.back, t.common.back),
    h('main', {}, h('h1', {}, opts.title), opts.subtitle ? h('p', { class: 'hint' }, opts.subtitle) : null, el),
  );
}
