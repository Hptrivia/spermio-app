import { getMeta, setMeta } from './db';

/** The midwife's own business details, printed on invoices. Not patient data. */
export interface Practice {
  name: string;
  street: string;
  postcode: string;
  city: string;
  phone: string;
  email: string;
  ik: string;
  taxNote: string;
  iban: string;
  bank: string;
}

export const DEFAULT_TAX_NOTE = 'Umsatzsteuerfrei gemäß § 4 Nr. 14 UStG.';

export async function getPractice(): Promise<Practice> {
  return { name: '', street: '', postcode: '', city: '', phone: '', email: '', ik: '', taxNote: DEFAULT_TAX_NOTE, iban: '', bank: '', ...(await getMeta<Partial<Practice>>('practice')) };
}

export const savePractice = (p: Practice) => setMeta('practice', p);

/** Sequential invoice numbers per year: 2026-0001, 2026-0002, … */
export async function nextInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const seq = await getMeta<{ year: number; n: number }>('invoiceSeq');
  const n = seq?.year === year ? seq.n + 1 : 1;
  await setMeta('invoiceSeq', { year, n });
  return `${year}-${String(n).padStart(4, '0')}`;
}
