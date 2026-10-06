import { ART_BY_LOCATION, TARIFF, gpos, materialByCode, serviceByBase, type Art } from './tariff';
import type { ChildPayload, Entry, VisitPayload } from './types';

export interface Line {
  date: string;
  code: string;
  label: string;
  units: number;
  unitPrice: number;
  amount: number;
  payer: 'mother' | 'child';
  /** Service base (e.g. "301") for per-day and per-case limits; absent for material and travel. */
  base?: string;
  surcharge?: boolean;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const euro = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export function minutesBetween(start: string, end: string): number {
  return start && end ? toMin(end) - toMin(start) : 0;
}

// ---- Surcharge (§ 3): night 21–6, Saturday from 12:00, Sundays and public holidays ----

function easterSunday(year: number): Date {
  // Anonymous Gregorian algorithm
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Nationwide public holidays only. State-specific ones (e.g. Fronleichnam) are not included yet. */
export function nationalHolidays(year: number): Set<string> {
  const easter = easterSunday(year).getTime();
  const rel = (days: number) => iso(new Date(easter + days * 86_400_000));
  return new Set([
    `${year}-01-01`, rel(-2), rel(1), `${year}-05-01`, rel(39), rel(50), `${year}-10-03`, `${year}-12-25`, `${year}-12-26`,
  ]);
}

export function isSurchargeTime(date: string, minuteOfDay: number): boolean {
  const m = ((minuteOfDay % 1440) + 1440) % 1440;
  if (m < 6 * 60 || m >= 21 * 60) return true;
  const dow = new Date(date + 'T00:00Z').getUTCDay();
  if (dow === 0) return true;
  if (dow === 6 && m >= 12 * 60) return true;
  return nationalHolidays(Number(date.slice(0, 4))).has(date);
}

// ---- Lines for one visit ----

export interface VisitContext {
  /** 301 aufsuchend may go up to 120 min in the first three days of life and on the day of the first home visit. */
  earlyBonus?: boolean;
}

export function visitLines(v: VisitPayload, ctx: VisitContext = {}): { lines: Line[]; warnings: string[] } {
  const lines: Line[] = [];
  const warnings: string[] = [];
  const art: Art = ART_BY_LOCATION[v.location] ?? '1';
  const mins = minutesBetween(v.startTime, v.endTime);
  const start = v.startTime ? toMin(v.startTime) : 0;

  for (const base of v.billingCodes ?? []) {
    const s = serviceByBase(base);
    if (!s) continue;
    const limits = s.arts[art];
    if (!limits) {
      warnings.push(`${base}: nicht als „${TARIFF.arts[art]}“ abrechenbar`);
      continue;
    }
    if (s.flat) {
      const z = isSurchargeTime(v.date, start);
      const price = (z ? limits.priceSurcharge : undefined) ?? limits.price!;
      lines.push({ date: v.date, code: gpos(base, z, art), label: s.label, units: 1, unitPrice: price, amount: price, payer: s.payer, base, surcharge: z });
      continue;
    }
    let units = Math.floor(Math.max(mins, 0) / TARIFF.unitMinutes);
    const cap = s.earlyDays && art === '1' && ctx.earlyBonus ? 24 : limits.perContact;
    if (cap !== undefined && units > cap) {
      warnings.push(`${base}: auf ${cap} Einheiten (${cap * 5} Min.) pro Kontakt begrenzt`);
      units = cap;
    }
    // Surcharge is decided by the start time of each 5-minute unit; Telefonkurzberatung never has one.
    let zUnits = 0;
    if (s.priceSurcharge && art !== '4') {
      for (let i = 0; i < units; i++) if (isSurchargeTime(v.date, start + i * TARIFF.unitMinutes)) zUnits++;
    }
    const normal = units - zUnits;
    if (normal > 0) lines.push(line(v.date, gpos(base, false, art), s.label, normal, s.price!, s.payer, base, false));
    if (zUnits > 0) lines.push(line(v.date, gpos(base, true, art), `${s.label} (Zuschlag)`, zUnits, s.priceSurcharge!, s.payer, base, true));
  }

  for (const code of v.materials ?? []) {
    const m = materialByCode(code);
    if (m) lines.push(line(v.date, m.code, m.label, 1, m.price, 'mother'));
  }

  if (v.location === 'home' && v.travelKm && v.travelKm > 0) {
    const t = TARIFF.travel;
    lines.push(line(v.date, v.travelShared ? t.sharedCode : t.code, v.travelShared ? t.sharedLabel : t.label, v.travelKm, t.perKm, 'mother'));
  }
  return { lines, warnings };
}

function line(date: string, code: string, label: string, units: number, unitPrice: number, payer: 'mother' | 'child', base?: string, surcharge?: boolean): Line {
  return { date, code, label, units, unitPrice, amount: round2(units * unitPrice), payer, base, surcharge };
}

export const sumLines = (lines: Line[]) => round2(lines.reduce((s, l) => s + l.amount, 0));

export const daysOld = (birthDate: string, date: string) => Math.round((Date.parse(date) - Date.parse(birthDate)) / 86_400_000);

/** 301 aufsuchend: up to 120 min in the first three days of life and on the day of the first home visit. */
export function earlyPostpartumBonus(v: VisitPayload, ownId: string | undefined, children: ChildPayload[], visits: Entry<VisitPayload>[]): boolean {
  const birth = children.map((c) => c.birthDate).filter(Boolean).sort().pop();
  if (birth && daysOld(birth, v.date) <= 2) return true;
  const earlierHome = visits.some((o) => o.id !== ownId && o.payload.location === 'home' && o.payload.phase === 'postpartum' && o.payload.date < v.date);
  return v.location === 'home' && v.phase === 'postpartum' && !earlierHome;
}
