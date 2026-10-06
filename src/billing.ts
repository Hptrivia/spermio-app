import { TARIFF, type Position } from './tariff';

export function minutesBetween(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

/** Units for one position on one visit: started units, capped per contact. */
export function unitsForContact(minutes: number, pos: Position): number {
  if (minutes <= 0) return 0;
  return Math.min(Math.ceil(minutes / pos.unitMinutes), pos.maxUnitsPerContact);
}

export const travelCost = (km: number) => round2(km * TARIFF.travelPerKm);

export const round2 = (n: number) => Math.round(n * 100) / 100;

export const euro = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
