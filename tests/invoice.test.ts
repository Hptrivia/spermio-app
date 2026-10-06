import { describe, expect, it } from 'vitest';
import { computeInvoice, invoiceCsv } from '../src/invoice';
import type { ChildPayload, Entry, InvoicePayload, VisitPayload } from '../src/types';

let n = 0;
const entry = <P>(payload: P): Entry<P> => ({ id: `e${n++}`, type: 'visit', version: 1, createdAt: '', updatedAt: '', deviceId: 'd', deleted: false, payload });
const visit = (o: Partial<VisitPayload>) =>
  entry<VisitPayload>({ patientId: 'p', date: '2026-10-07', startTime: '10:00', endTime: '10:30', location: 'home', seen: 'mother', phase: 'pregnancy', notes: '', billingCodes: [], travelKm: 0, ...o });

describe('computeInvoice', () => {
  const base = { from: '2026-10-01', to: '2026-10-31', children: [] as Entry<ChildPayload>[], alreadyBilled: new Set<string>() };

  it('caps units per day across two visits on the same day', () => {
    const visits = [
      visit({ billingCodes: ['101'], startTime: '09:00', endTime: '10:00' }), // 12 units
      visit({ billingCodes: ['101'], startTime: '14:00', endTime: '15:00' }), // 12 more, only 6 left (18/day)
    ];
    const r = computeInvoice({ ...base, payerKey: 'mother', visits });
    expect(r.lines.map((l) => l.units)).toEqual([12, 6]);
    expect(r.total).toBe(111.42);
    expect(r.warnings.some((w) => w.includes('pro Tag'))).toBe(true);
  });

  it('sends child positions to the child insurer, skips other dates and billed visits', () => {
    const child = entry<ChildPayload>({ patientId: 'p', name: 'Ida', birthDate: '2026-09-20' } as ChildPayload);
    const v1 = visit({ phase: 'postpartum', billingCodes: ['303', '305'], childId: child.id, travelKm: 10 });
    const v2 = visit({ date: '2026-09-15', billingCodes: ['101'] });
    const v3 = visit({ date: '2026-10-08', billingCodes: ['101'] });
    const args = { ...base, children: [child], visits: [v1, v2, v3], alreadyBilled: new Set([v3.id]) };
    const mother = computeInvoice({ ...args, payerKey: 'mother' });
    expect(mother.lines.map((l) => l.code)).toEqual(['30301', '50100']);
    expect(mother.visitIds).toEqual([v1.id]);
    const kid = computeInvoice({ ...args, payerKey: `child:${child.id}` });
    expect(kid.lines.map((l) => l.code)).toEqual(['30501']);
    expect(computeInvoice({ ...args, payerKey: 'private' }).lines).toHaveLength(3);
  });

  it('warns when a contact limit is exceeded', () => {
    const visits = [1, 2].map((d) => visit({ date: `2026-10-0${d}`, billingCodes: ['104'] }));
    expect(computeInvoice({ ...base, payerKey: 'mother', visits }).warnings.join()).toContain('erlaubt sind 1');
  });

  it('writes a semicolon CSV with decimal commas', () => {
    const inv = { number: '2026-0001', issuedAt: '2026-10-07', payer: 'Test; Kasse', insuredName: 'A B', insuranceNumber: 'Z1', total: 37.14,
      lines: [{ date: '2026-10-07', code: '10101', label: 'Hilfeleistung', units: 6, unitPrice: 6.19, amount: 37.14, payer: 'mother' }] } as InvoicePayload;
    const csv = invoiceCsv(inv, 'A B');
    expect(csv.startsWith('﻿Rechnungsnummer;')).toBe(true);
    expect(csv).toContain('2026-0001;2026-10-07;"Test; Kasse";A B;Z1;2026-10-07;10101;Hilfeleistung;6;6,19;37,14');
  });
});
