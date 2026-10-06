import { euro } from '../billing';
import { h, mount } from '../dom';
import { billedVisitIds, computeInvoice, invoiceCsv, payerOptions, type Computed } from '../invoice';
import { invoicePdf } from '../pdf';
import { getPractice, nextInvoiceNumber } from '../practice';
import { shareOrDownload } from '../platform';
import { go } from '../router';
import * as store from '../store';
import { t } from '../strings/de';
import type { ChildPayload, Entry, InvoicePayload, PatientPayload, VisitPayload } from '../types';
import { fmtDate } from './patient';

const today = () => new Date().toISOString().slice(0, 10);

async function load(pid: string) {
  const patient = await store.get<PatientPayload>(pid);
  const mine = <P extends { patientId: string }>(rows: Entry<P>[]) => rows.filter((e) => e.payload.patientId === pid);
  const [visits, children, invoices] = await Promise.all([
    store.list<VisitPayload>('visit').then(mine),
    store.list<ChildPayload>('child').then(mine),
    store.list<InvoicePayload>('invoice').then(mine),
  ]);
  return { patient, visits, children, invoices };
}

function linesTable(lines: InvoicePayload['lines'], total: number): HTMLElement {
  return h('div', { class: 'inv-table' },
    ...lines.map((l) =>
      h('div', { class: 'inv-line' },
        h('div', { class: 'inv-main' }, h('span', {}, `${fmtDate(l.date)} · ${l.code}`), h('strong', {}, euro(l.amount))),
        h('div', { class: 'item-sub' }, `${l.label} · ${String(l.units).replace('.', ',')} × ${euro(l.unitPrice)}`),
      ),
    ),
    h('div', { class: 'inv-main inv-total' }, h('span', {}, t.invoice.total), h('strong', {}, euro(total))),
  );
}

export async function invoiceNewScreen(pid: string): Promise<void> {
  const { patient, visits, children, invoices } = await load(pid);
  if (!patient) return go('/', true);
  const payers = payerOptions(patient.payload, children);
  let payerKey = payers[0].key;
  const from = h('input', { type: 'date' }) as HTMLInputElement;
  const to = h('input', { type: 'date', value: today() }) as HTMLInputElement;
  const preview = h('div', {});
  const err = h('p', { class: 'error', role: 'alert' });
  const create = h('button', { class: 'primary' }, t.invoice.create) as HTMLButtonElement;
  let computed: Computed | undefined;

  // Default start: the earliest visit not yet billed to this payer.
  const resetFrom = () => {
    const billed = billedVisitIds(invoices, payerKey);
    from.value = visits.filter((v) => !billed.has(v.id)).map((v) => v.payload.date).sort()[0] ?? today();
  };
  const recompute = () => {
    computed = computeInvoice({ payerKey, from: from.value, to: to.value, visits, children, alreadyBilled: billedVisitIds(invoices, payerKey) });
    preview.replaceChildren(
      computed.lines.length ? linesTable(computed.lines, computed.total) : h('p', { class: 'empty' }, t.invoice.nothing),
      ...computed.warnings.map((w) => h('p', { class: 'hint warn-text' }, w)),
    );
    create.disabled = computed.lines.length === 0;
  };

  const payerBox = h('div', { class: 'choices' },
    ...payers.map((p, i) => {
      const r = h('input', { type: 'radio', name: 'payer', value: p.key, checked: i === 0 }) as HTMLInputElement;
      r.addEventListener('change', () => {
        payerKey = p.key;
        resetFrom();
        recompute();
      });
      return h('label', { class: 'chip' }, r, h('span', {}, p.label));
    }),
  );
  from.addEventListener('change', recompute);
  to.addEventListener('change', recompute);

  create.addEventListener('click', async () => {
    if (!computed?.lines.length) return;
    create.disabled = true;
    const payer = payers.find((p) => p.key === payerKey)!;
    const inv = await store.create<InvoicePayload>('invoice', {
      number: await nextInvoiceNumber(),
      issuedAt: today(),
      patientId: pid,
      payerKey,
      payer: payerKey === 'private' ? `${patient.payload.firstName} ${patient.payload.lastName}` : payer.insurer,
      insuredName: payer.insuredName,
      insuranceNumber: payer.insuranceNumber,
      from: from.value,
      to: to.value,
      visitIds: computed.visitIds,
      lines: computed.lines,
      total: computed.total,
      status: 'draft',
    });
    go(`/p/${pid}/invoice/${inv.id}`, true);
  });

  resetFrom();
  recompute();
  mount(
    h('header', { class: 'bar' }, h('button', { class: 'link', onclick: () => go(`/p/${pid}`) }, `← ${t.common.back}`)),
    h('main', {},
      h('h1', {}, t.invoice.newTitle),
      h('p', { class: 'hint' }, `${patient.payload.firstName} ${patient.payload.lastName}`),
      h('div', { class: 'card' },
        h('div', { class: 'field' }, h('span', { class: 'label' }, t.invoice.payer), payerBox),
        h('div', { class: 'grid2' },
          h('div', { class: 'field' }, h('span', { class: 'label' }, t.invoice.from), from),
          h('div', { class: 'field' }, h('span', { class: 'label' }, t.invoice.to), to),
        ),
        preview,
        err,
        create,
      ),
    ),
  );
}

export async function invoiceScreen(pid: string, iid: string): Promise<void> {
  const { patient } = await load(pid);
  const inv = await store.get<InvoicePayload>(iid);
  if (!patient || !inv) return go(`/p/${pid}`, true);
  const x = inv.payload;
  const p = patient.payload;
  const name = `${p.firstName} ${p.lastName}`;
  const fileBase = `Rechnung_${x.number}_${p.lastName}`.replace(/[^\w.-]+/g, '_');
  const msg = h('p', { class: 'hint warn-text' });

  const pdfBtn = h('button', { class: 'primary' }, t.invoice.pdf) as HTMLButtonElement;
  pdfBtn.addEventListener('click', async () => {
    const practice = await getPractice();
    if (!practice.name || !practice.ik) msg.textContent = t.invoice.practiceMissing;
    const address = [p.address?.street, [p.address?.postcode, p.address?.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const bytes = await invoicePdf(x, practice, { name, dateOfBirth: x.payerKey.startsWith('child:') ? undefined : p.dateOfBirth, address });
    await shareOrDownload(`${fileBase}.pdf`, bytes, 'application/pdf');
  });
  const csvBtn = h('button', {}, t.invoice.csv);
  csvBtn.addEventListener('click', () => shareOrDownload(`${fileBase}.csv`, invoiceCsv(x, name), 'text/csv'));

  const statusBox = h('div', { class: 'choices' },
    ...(['draft', 'sent', 'paid'] as const).map((s) => {
      const r = h('input', { type: 'radio', name: 'status', checked: x.status === s }) as HTMLInputElement;
      r.addEventListener('change', async () => {
        await store.update(inv, { ...x, status: s });
        void invoiceScreen(pid, iid);
      });
      return h('label', { class: 'chip' }, r, h('span', {}, t.invoice.statuses[s]));
    }),
  );

  mount(
    h('header', { class: 'bar' }, h('button', { class: 'link', onclick: () => go(`/p/${pid}`) }, `← ${name}`)),
    h('main', {},
      h('div', { class: 'title-row' }, h('h1', {}, `${t.invoice.title} ${x.number}`), h('span', { class: `badge ${x.status}` }, t.invoice.statuses[x.status])),
      h('div', { class: 'card info' },
        h('div', { class: 'info-row' }, h('span', {}, t.invoice.payer), h('span', {}, x.payer)),
        h('div', { class: 'info-row' }, h('span', {}, t.invoice.insured), h('span', {}, [x.insuredName, x.insuranceNumber].filter(Boolean).join(' · '))),
        h('div', { class: 'info-row' }, h('span', {}, t.invoice.period), h('span', {}, `${fmtDate(x.from)} – ${fmtDate(x.to)}`)),
        h('div', { class: 'info-row' }, h('span', {}, t.invoice.issued), h('span', {}, fmtDate(x.issuedAt))),
      ),
      h('div', { class: 'row actions' }, pdfBtn, csvBtn),
      msg,
      h('div', { class: 'card' }, h('div', { class: 'field' }, h('span', { class: 'label' }, t.invoice.status), statusBox)),
      h('div', { class: 'card' }, linesTable(x.lines, x.total)),
      h('button', {
        class: 'link danger-link',
        onclick: async () => {
          if (!confirm(t.invoice.deleteConfirm)) return;
          await store.remove(inv);
          go(`/p/${pid}`, true);
        },
      }, t.invoice.delete),
    ),
  );
}
