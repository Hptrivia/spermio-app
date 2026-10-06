import { daysOld, earlyPostpartumBonus, euro, minutesBetween, sumLines, visitLines, type VisitContext } from '../billing';
import { h, mount } from '../dom';
import { childFields, noteFields, patientFields, patientStatusField, visitFields } from '../fields';
import { buildForm, requiredMessage, type Form } from '../forms';
import { go } from '../router';
import * as store from '../store';
import { t } from '../strings/de';
import { ART_BY_LOCATION, TARIFF, serviceByBase } from '../tariff';
import type { ChildPayload, Entry, InvoicePayload, NotePayload, PatientPayload, VisitPayload } from '../types';

const today = () => new Date().toISOString().slice(0, 10);
export const fmtDate = (d?: string) => (d ? new Date(d + 'T00:00').toLocaleDateString('de-DE') : '–');
const fullName = (p: PatientPayload) => `${p.firstName} ${p.lastName}`;

function topBar(backTo: string, backLabel: string): HTMLElement {
  return h('header', { class: 'bar' }, h('button', { class: 'link', onclick: () => go(backTo) }, `← ${backLabel}`));
}

async function forPatient<P extends { patientId: string }>(type: 'visit' | 'child' | 'note' | 'invoice', pid: string): Promise<Entry<P>[]> {
  return (await store.list<P>(type)).filter((e) => e.payload.patientId === pid);
}

// ---------- Patient file ----------

export async function patientScreen(pid: string): Promise<void> {
  const patient = await store.get<PatientPayload>(pid);
  if (!patient) return go('/', true);
  const p = patient.payload;
  const [visits, children, notes, invoices] = await Promise.all([
    forPatient<VisitPayload>('visit', pid),
    forPatient<ChildPayload>('child', pid),
    forPatient<NotePayload>('note', pid),
    forPatient<InvoicePayload>('invoice', pid),
  ]);
  invoices.sort((a, b) => b.payload.number.localeCompare(a.payload.number));
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
      h('div', { class: 'title-row' },
        h('h2', {}, t.invoice.list),
        h('button', { class: 'small', onclick: () => go(`/p/${pid}/invoice/new`) }, t.invoice.add),
      ),
      invoices.length
        ? h('ul', { class: 'list' }, ...invoices.map((i) =>
            h('li', { class: 'item tappable', onclick: () => go(`/p/${pid}/invoice/${i.id}`) },
              h('div', { class: 'item-main' }, h('strong', {}, `${i.payload.number} · ${euro(i.payload.total)}`), h('span', { class: `badge ${i.payload.status}` }, t.invoice.statuses[i.payload.status])),
              h('div', { class: 'item-sub' }, `${i.payload.payer} · ${fmtDate(i.payload.from)} – ${fmtDate(i.payload.to)}`),
            )))
        : null,
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
      billingCodes: suggestServices(children, lastVisit?.payload),
      materials: [],
    };
    const allVisits = await forPatient<VisitPayload>('visit', pid);
    const ctxFor = (v: VisitPayload): VisitContext => ({ earlyBonus: earlyPostpartumBonus(v, eid, children.map((c) => c.payload), allVisits) });
    const billing = billingPicker(initial.billingCodes ?? [], initial.materials ?? [], ctxFor);
    form = buildForm(visitFields(Object.fromEntries(children.map((c) => [c.id, c.payload.name]))), initial, () => billing.update(form.read() as unknown as VisitPayload));
    billing.update(form.read() as unknown as VisitPayload);
    extra = billing.el;
    const read = form.read;
    form.read = () => ({ ...read(), ...billing.selected() });
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

/** Services and materials for the visit's phase, with a live preview of the fee positions and amounts. */
function billingPicker(initialCodes: string[], initialMaterials: string[], ctxFor: (v: VisitPayload) => VisitContext) {
  const chosen = new Set(initialCodes);
  const materials = new Set(initialMaterials);
  const servicesBox = h('div', { class: 'positions' });
  const materialsBox = h('div', { class: 'positions' });
  const preview = h('div', { class: 'preview' });
  const el = h('div', {},
    h('h2', { class: 'section' }, t.visit.billing, h('small', { class: 'sample' }, t.visit.tariffNote)),
    servicesBox,
    h('h2', { class: 'section' }, t.visit.materials),
    materialsBox,
    preview,
  );
  let current: VisitPayload | undefined;
  let renderedFor = '';

  const renderPreview = () => {
    const v = { ...current!, billingCodes: [...chosen], materials: [...materials] };
    const { lines, warnings } = visitLines(v, ctxFor(v));
    preview.replaceChildren(
      ...lines.map((l) => h('div', { class: 'preview-line' }, h('span', {}, `${l.code} · ${l.units} × ${euro(l.unitPrice)}`), h('span', {}, euro(l.amount)))),
      ...(lines.length ? [h('div', { class: 'preview-line total' }, h('span', {}, `${t.visit.duration}: ${minutesBetween(v.startTime, v.endTime)} ${t.patient.minutes}`), h('span', {}, euro(sumLines(lines))))] : []),
      ...warnings.map((w) => h('p', { class: 'hint warn-text' }, w)),
    );
  };

  const toggle = (set: Set<string>, code: string, on: boolean) => {
    if (on) set.add(code);
    else set.delete(code);
    renderPreview();
  };

  // Rebuilt only when phase or contact type changes, so a tap right after leaving a text field isn't swallowed.
  const update = (v: VisitPayload) => {
    current = v;
    const key = `${v.phase}|${v.location}`;
    if (key !== renderedFor) {
      renderedFor = key;
      const art = ART_BY_LOCATION[v.location];
      servicesBox.replaceChildren(
        ...TARIFF.services.filter((s) => s.phase === v.phase || chosen.has(s.base)).map((s) => {
          const allowed = !!s.arts[art];
          const cb = h('input', { type: 'checkbox', checked: chosen.has(s.base) }) as HTMLInputElement;
          cb.addEventListener('change', () => toggle(chosen, s.base, cb.checked));
          return h('label', { class: `position${allowed ? '' : ' muted'}` }, cb,
            h('span', { class: 'pos-label' }, h('strong', {}, `${s.base}..`), ' ', s.label, s.payer === 'child' ? ` (${t.fields.childInsurer})` : ''),
            allowed ? null : h('span', { class: 'pos-amount' }, t.visit.notForArt),
          );
        }),
      );
      materialsBox.replaceChildren(
        ...TARIFF.materials.filter((m) => m.phase === v.phase || materials.has(m.code)).map((m) => {
          const cb = h('input', { type: 'checkbox', checked: materials.has(m.code) }) as HTMLInputElement;
          cb.addEventListener('change', () => toggle(materials, m.code, cb.checked));
          return h('label', { class: 'position' }, cb, h('span', { class: 'pos-label' }, h('strong', {}, m.code), ' ', m.label), h('span', { class: 'pos-amount' }, euro(m.price)));
        }),
      );
    }
    renderPreview();
  };
  return { el, update, selected: () => ({ billingCodes: [...chosen], materials: [...materials] }) };
}

/** Pre-selects the usual service: early/late postpartum by the child's age, else what the last visit used. */
function suggestServices(children: Entry<ChildPayload>[], last?: VisitPayload): string[] {
  const birth = children.map((c) => c.payload.birthDate).filter(Boolean).sort().pop();
  if (birth) {
    const age = daysOld(birth, today());
    if (age <= 10) return ['301'];
    if (age <= 84) return ['303'];
    return ['306'];
  }
  return last?.billingCodes?.filter((c) => serviceByBase(c)) ?? [];
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
