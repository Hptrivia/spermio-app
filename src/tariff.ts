import tariff from './config/tariff.json';

export type Phase = 'pregnancy' | 'birth' | 'postpartum';
/** Leistungsart, the 5th digit of a fee position: 1 aufsuchend, 2 nicht aufsuchend, 3 Video, 4 Telefonkurzberatung. */
export type Art = '1' | '2' | '3' | '4';

export interface ArtLimits {
  perContact?: number;
  perDay?: number;
  maxUnits?: number;
  maxContacts?: number;
  price?: number;
  priceSurcharge?: number;
}

export interface Service {
  base: string;
  label: string;
  phase: Phase;
  payer: 'mother' | 'child';
  price?: number;
  priceSurcharge?: number;
  flat?: boolean;
  earlyDays?: boolean;
  artLabels?: Partial<Record<Art, string>>;
  arts: Partial<Record<Art, ArtLimits>>;
}

export interface Material {
  code: string;
  label: string;
  price: number;
  phase: Phase;
  once?: boolean;
}

export const TARIFF = tariff as unknown as {
  validFrom: string;
  unitMinutes: number;
  arts: Record<Art, string>;
  services: Service[];
  materials: Material[];
  travel: { perKm: number; code: string; label: string; sharedCode: string; sharedLabel: string };
};

export const ART_BY_LOCATION: Record<string, Art> = { home: '1', practice: '2', video: '3', phone: '4' };

export const serviceByBase = (base: string) => TARIFF.services.find((s) => s.base === base);
export const materialByCode = (code: string) => TARIFF.materials.find((m) => m.code === code);

/** Five-digit fee position: category + running number (base), surcharge digit, Leistungsart. */
export const gpos = (base: string, surcharge: boolean, art: Art) => `${base}${surcharge ? 1 : 0}${art}`;
