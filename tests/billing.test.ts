import { describe, expect, it } from 'vitest';
import { isSurchargeTime, nationalHolidays, sumLines, visitLines } from '../src/billing';
import type { VisitPayload } from '../src/types';

const visit = (o: Partial<VisitPayload>): VisitPayload => ({
  patientId: 'p', date: '2026-10-07', startTime: '10:00', endTime: '10:30', location: 'home', seen: 'mother',
  phase: 'pregnancy', notes: '', billingCodes: [], travelKm: 0, ...o,
});

describe('billing (Vergütungsverzeichnis ab 01.11.2025)', () => {
  it('matches the published example amounts', () => {
    // Example from the opta data/hebrech webinar: 30 min Hilfeleistung = 6 × 6,19; 60 min Aufklärungsgespräch = 12 × 6,19
    expect(sumLines(visitLines(visit({ billingCodes: ['101'], endTime: '10:30' })).lines)).toBe(37.14);
    expect(sumLines(visitLines(visit({ billingCodes: ['103'], endTime: '11:00' })).lines)).toBe(74.28);
    const travel = visitLines(visit({ travelKm: 20, travelShared: true })).lines[0];
    expect([travel.code, travel.amount]).toEqual(['50200', 19.4]);
  });

  it('counts only completed 5-minute units and caps per contact', () => {
    const r = visitLines(visit({ billingCodes: ['102'], endTime: '10:42' })); // Vorsorge max 30 min
    expect(r.lines[0]).toMatchObject({ code: '10201', units: 6, amount: 37.14 });
    expect(r.warnings).toHaveLength(1);
    expect(visitLines(visit({ billingCodes: ['101'], endTime: '10:14' })).lines[0].units).toBe(2);
  });

  it('derives the fee position from location and splits surcharge units by their start time', () => {
    const r = visitLines(visit({ billingCodes: ['101'], startTime: '20:50', endTime: '21:20' }));
    expect(r.lines.map((l) => [l.code, l.units])).toEqual([['10101', 2], ['10111', 4]]);
    expect(visitLines(visit({ billingCodes: ['101'], location: 'video' })).lines[0].code).toBe('10103');
    expect(visitLines(visit({ billingCodes: ['102'], location: 'video' })).warnings[0]).toContain('nicht');
    // Telefonkurzberatung: never a surcharge, max 2 units
    expect(visitLines(visit({ billingCodes: ['301'], location: 'phone', date: '2026-10-11', endTime: '10:30' })).lines[0]).toMatchObject({ code: '30104', units: 2 });
  });

  it('allows 120 min early postpartum visits only with the early bonus', () => {
    const v = visit({ phase: 'postpartum', billingCodes: ['301'], endTime: '12:00' });
    expect(visitLines(v).lines[0].units).toBe(18);
    expect(visitLines(v, { earlyBonus: true }).lines[0].units).toBe(24);
  });

  it('knows surcharge times: night, Saturday afternoon, Sunday, national holidays', () => {
    expect(isSurchargeTime('2026-10-07', 5 * 60 + 55)).toBe(true); // Wed 05:55
    expect(isSurchargeTime('2026-10-07', 6 * 60)).toBe(false);
    expect(isSurchargeTime('2026-10-10', 11 * 60 + 55)).toBe(false); // Sat 11:55
    expect(isSurchargeTime('2026-10-10', 12 * 60)).toBe(true);
    expect(isSurchargeTime('2026-10-11', 10 * 60)).toBe(true); // Sunday
    expect(nationalHolidays(2026)).toEqual(new Set(['2026-01-01', '2026-04-03', '2026-04-06', '2026-05-01', '2026-05-14', '2026-05-25', '2026-10-03', '2026-12-25', '2026-12-26']));
  });
});
