import { earlyPostpartumBonus, round2, sumLines, visitLines, type Line } from './billing';
import { serviceByBase, type Art } from './tariff';
import type { ChildPayload, Entry, InvoicePayload, PatientPayload, VisitPayload } from './types';

export interface PayerOption {
  key: string;
  label: string;
  insurer: string;
  insuredName: string;
  insuranceNumber: string;
}

/** Who can be billed for this patient: her insurer, each child's insurer, or herself privately. */
export function payerOptions(p: PatientPayload, children: Entry<ChildPayload>[]): PayerOption[] {
  const name = `${p.firstName} ${p.lastName}`;
  const opts: PayerOption[] = [];
  if (p.insuranceType !== 'private') {
    opts.push({ key: 'mother', label: `${p.insurerName || 'Krankenkasse'} (${name})`, insurer: p.insurerName, insuredName: name, insuranceNumber: p.insuranceNumber });
  }
  for (const c of children) {
    const insurer = c.payload.insurerName || p.insurerName;
    opts.push({ key: `child:${c.id}`, label: `${insurer || 'Krankenkasse'} (Kind ${c.payload.name})`, insurer, insuredName: `${c.payload.name} ${p.lastName}`, insuranceNumber: c.payload.insuranceNumber });
  }
  opts.push({ key: 'private', label: `Privatrechnung an ${name}`, insurer: '', insuredName: name, insuranceNumber: '' });
  return opts;
}

export interface Computed {
  lines: Line[];
  visitIds: string[];
  warnings: string[];
  total: number;
}

/**
 * Builds invoice lines for one payer and date range from the patient's visits.
 * Applies per-day and per-case unit limits across visits; contact-count limits are reported as warnings.
 */
export function computeInvoice(opts: {
  payerKey: string;
  from: string;
  to: string;
  visits: Entry<VisitPayload>[];
  children: Entry<ChildPayload>[];
  alreadyBilled: Set<string>;
}): Computed {
  const { payerKey, from, to, children, alreadyBilled } = opts;
  const all = [...opts.visits].sort((a, b) => (a.payload.date + a.payload.startTime).localeCompare(b.payload.date + b.payload.startTime));
  const childPayloads = children.map((c) => c.payload);
  const firstChild = children[0]?.id;

  const lines: Line[] = [];
  const visitIds: string[] = [];
  const warnings: string[] = [];
  const usedPerDay = new Map<string, number>();
  const usedTotal = new Map<string, number>();

  for (const v of all) {
    const x = v.payload;
    if (x.date < from || x.date > to || alreadyBilled.has(v.id)) continue;
    const r = visitLines(x, { earlyBonus: earlyPostpartumBonus(x, v.id, childPayloads, all) });
    warnings.push(...r.warnings.map((w) => `${fmt(x.date)}: ${w}`));

    const target = (l: Line) => (l.payer === 'child' ? `child:${x.childId ?? firstChild}` : 'mother');
    const mine = r.lines.filter((l) => payerKey === 'private' || target(l) === payerKey);

    for (const l of mine) {
      if (!l.base) {
        lines.push(l);
        continue;
      }
      const limits = serviceByBase(l.base)?.arts[l.code.slice(-1) as Art];
      let units = l.units;
      const dayKey = `${x.date}|${l.base}`;
      if (limits?.perDay !== undefined) {
        const left = limits.perDay - (usedPerDay.get(dayKey) ?? 0);
        if (units > left) {
          warnings.push(`${fmt(x.date)}: ${l.code} auf ${Math.max(left, 0)} Einheiten gekürzt (max. ${limits.perDay} pro Tag)`);
          units = Math.max(left, 0);
        }
      }
      if (limits?.maxUnits !== undefined) {
        const left = limits.maxUnits - (usedTotal.get(l.base) ?? 0);
        if (units > left) {
          warnings.push(`${fmt(x.date)}: ${l.code} auf ${Math.max(left, 0)} Einheiten gekürzt (max. ${limits.maxUnits} insgesamt)`);
          units = Math.max(left, 0);
        }
      }
      usedPerDay.set(dayKey, (usedPerDay.get(dayKey) ?? 0) + units);
      usedTotal.set(l.base, (usedTotal.get(l.base) ?? 0) + units);
      if (units > 0) lines.push({ ...l, units, amount: round2(units * l.unitPrice) });
    }
    if (mine.length) visitIds.push(v.id);
  }

  // Contact limits count every visit of the case, not just this invoice.
  const contacts = new Map<string, number>();
  for (const v of all) for (const b of new Set(v.payload.billingCodes)) contacts.set(b, (contacts.get(b) ?? 0) + 1);
  for (const [base, n] of contacts) {
    const max = Math.max(0, ...Object.values(serviceByBase(base)?.arts ?? {}).map((a) => a.maxContacts ?? 0));
    if (max && n > max) warnings.push(`${base}: ${n} Kontakte erfasst, erlaubt sind ${max} (ggf. ärztliche Anordnung nötig)`);
  }

  return { lines, visitIds, warnings, total: sumLines(lines) };
}

const fmt = (d: string) => new Date(d + 'T00:00').toLocaleDateString('de-DE');

/** Visit ids already on a (non-deleted) invoice to the same payer. */
export function billedVisitIds(invoices: Entry<InvoicePayload>[], payerKey: string, exceptInvoiceId?: string): Set<string> {
  return new Set(invoices.filter((i) => i.id !== exceptInvoiceId && i.payload.payerKey === payerKey).flatMap((i) => i.payload.visitIds));
}

// ---- CSV for a billing service: semicolon-separated, decimal comma, BOM so Excel opens umlauts correctly ----

export function invoiceCsv(inv: InvoicePayload, patientName: string): string {
  const num = (n: number) => n.toFixed(2).replace('.', ',');
  const esc = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const rows = [
    ['Rechnungsnummer', 'Rechnungsdatum', 'Kostenträger', 'Versicherte', 'Versichertennummer', 'Leistungsdatum', 'Gebührenposition', 'Leistung', 'Anzahl', 'Einzelbetrag', 'Betrag'],
    ...inv.lines.map((l) => [inv.number, inv.issuedAt, inv.payer, inv.insuredName || patientName, inv.insuranceNumber, l.date, l.code, l.label, num(l.units).replace(/,00$/, ''), num(l.unitPrice), num(l.amount)]),
    ['', '', '', '', '', '', '', 'Gesamt', '', '', num(inv.total)],
  ];
  return '﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n') + '\r\n';
}
