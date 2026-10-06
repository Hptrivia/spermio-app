import tariff from './config/tariff.sample.json';

export type Phase = 'pregnancy' | 'birth' | 'postpartum';

export interface Position {
  code: string;
  label: string;
  unitMinutes: number;
  pricePerUnit: number;
  maxUnitsPerContact: number;
  maxUnitsPerDay: number;
  payer: 'mother' | 'child';
  phases: Phase[];
}

export const TARIFF = tariff as { travelPerKm: number; currency: string; positions: Position[] };

export const positionByCode = (code: string) => TARIFF.positions.find((p) => p.code === code);
