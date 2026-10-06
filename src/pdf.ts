import type { PDFFont, PDFPage } from 'pdf-lib';
import type { Practice } from './practice';
import type { InvoicePayload } from './types';

const fmtDate = (d: string) => new Date(d + 'T00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const money = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

/** A4 invoice. pdf-lib is loaded only when an invoice is actually generated. */
export async function invoicePdf(inv: InvoicePayload, practice: Practice, patient: { name: string; dateOfBirth?: string; address: string }): Promise<Uint8Array<ArrayBuffer>> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  doc.setTitle(`Rechnung ${inv.number}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const grey = rgb(0.4, 0.4, 0.4);
  const W = 595.28, H = 841.89, M = 56;

  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;
  const text = (s: string, x: number, yy: number, o: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; right?: boolean } = {}) => {
    const size = o.size ?? 9.5, f = o.f ?? font;
    page.drawText(s, { x: o.right ? x - f.widthOfTextAtSize(s, size) : x, y: yy, size, font: f, color: o.color });
  };
  const wrap = (s: string, width: number, size: number) => {
    const words = s.split(' ');
    const out: string[] = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) > width && cur) {
        out.push(cur);
        cur = w;
      } else cur = next;
    }
    if (cur) out.push(cur);
    return out;
  };

  // Sender + recipient
  const senderLine = [practice.name, practice.street, [practice.postcode, practice.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
  text(senderLine || 'Hebammenpraxis', M, y, { size: 7.5, color: grey });
  y -= 22;
  const recipient = inv.payerKey === 'private' ? [patient.name, ...patient.address.split(', ')] : [inv.payer];
  for (const r of recipient.filter(Boolean)) {
    text(r, M, y, { size: 10.5 });
    y -= 14;
  }

  // Right block
  let ry = H - M - 22;
  const right = (label: string, value: string) => {
    if (!value) return;
    text(label, W - M - 150, ry, { color: grey });
    text(value, W - M, ry, { right: true });
    ry -= 13;
  };
  right('Rechnungsnr.', inv.number);
  right('Datum', fmtDate(inv.issuedAt));
  right('IK-Nummer', practice.ik);
  right('Telefon', practice.phone);
  right('E-Mail', practice.email);

  y = Math.min(y, ry) - 28;
  text('Rechnung über Hebammenhilfe', M, y, { size: 15, f: bold });
  y -= 22;
  const info = (label: string, value: string) => {
    if (!value) return;
    text(label, M, y, { color: grey });
    text(value, M + 110, y);
    y -= 13;
  };
  info('Versicherte/r', inv.insuredName);
  if (patient.dateOfBirth && inv.payerKey !== 'private') info('Geburtsdatum', fmtDate(patient.dateOfBirth));
  info('Versichertennr.', inv.insuranceNumber);
  info('Zeitraum', `${fmtDate(inv.from)} – ${fmtDate(inv.to)}`);
  y -= 14;

  // Table
  const cols = { date: M, code: M + 62, label: M + 112, units: W - M - 120, price: W - M - 58, amount: W - M };
  const header = () => {
    text('Datum', cols.date, y, { f: bold, size: 8.5 });
    text('GPOS', cols.code, y, { f: bold, size: 8.5 });
    text('Leistung', cols.label, y, { f: bold, size: 8.5 });
    text('Anzahl', cols.units, y, { f: bold, size: 8.5, right: true });
    text('Einzel', cols.price, y, { f: bold, size: 8.5, right: true });
    text('Betrag', cols.amount, y, { f: bold, size: 8.5, right: true });
    y -= 6;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: grey });
    y -= 13;
  };
  header();
  for (const l of inv.lines) {
    const labelLines = wrap(l.label, cols.units - cols.label - 40, 8.5);
    if (y - labelLines.length * 11 < M + 80) {
      page = doc.addPage([W, H]);
      y = H - M;
      header();
    }
    text(fmtDate(l.date), cols.date, y, { size: 8.5 });
    text(l.code, cols.code, y, { size: 8.5 });
    labelLines.forEach((s, i) => text(s, cols.label, y - i * 11, { size: 8.5 }));
    text(String(l.units).replace('.', ','), cols.units, y, { size: 8.5, right: true });
    text(money(l.unitPrice), cols.price, y, { size: 8.5, right: true });
    text(money(l.amount), cols.amount, y, { size: 8.5, right: true });
    y -= Math.max(1, labelLines.length) * 11 + 4;
  }
  page.drawLine({ start: { x: M, y: y + 6 }, end: { x: W - M, y: y + 6 }, thickness: 0.5, color: grey });
  y -= 10;
  text('Gesamtbetrag', cols.price - 40, y, { f: bold, size: 10.5, right: true });
  text(money(inv.total), cols.amount, y, { f: bold, size: 10.5, right: true });
  y -= 30;

  for (const s of wrap(practice.taxNote, W - 2 * M, 9)) {
    text(s, M, y, { size: 9 });
    y -= 12;
  }
  if (practice.iban) {
    y -= 6;
    text(`Bitte überweisen Sie den Betrag auf: ${practice.iban}${practice.bank ? ` (${practice.bank})` : ''}, Verwendungszweck ${inv.number}.`, M, y, { size: 9 });
  }
  return new Uint8Array(await doc.save());
}
