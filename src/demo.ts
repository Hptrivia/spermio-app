import * as store from './store';
import type { CareCasePayload, ChildPayload, InvoicePayload, PatientPayload, VisitPayload } from './types';

// Obviously fake people. Insurance numbers use the "Z" prefix so they can't collide with real ones.
const PEOPLE = [
  ['Lena', 'Musterfrau', 'Musterweg 1', '10115', 'Berlin', 'statutory', 'Beispiel-Krankenkasse'],
  ['Sophie', 'Beispiel', 'Probestraße 7', '20095', 'Hamburg', 'statutory', 'Test-BKK'],
  ['Mia', 'Testmann', 'Demoallee 12', '80331', 'München', 'private', 'Muster Privatversicherung'],
  ['Hanna', 'Fiktiv', 'Am Platzhalter 3', '50667', 'Köln', 'statutory', 'Beispiel-Krankenkasse'],
  ['Emilia', 'Erfunden', 'Scheinweg 22', '60311', 'Frankfurt', 'statutory', 'Test-BKK'],
] as const;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (days: number) => iso(new Date(Date.now() + days * 86_400_000));

/** Creates fake patients with care cases, children, visits and invoices. Returns patient count. */
export async function loadDemoData(): Promise<number> {
  for (const [i, [first, last, street, postcode, city, insType, insurer]] of PEOPLE.entries()) {
    const postpartum = i < 2; // first two already gave birth
    const patient = await store.create<PatientPayload>('patient', {
      firstName: first,
      lastName: last,
      dateOfBirth: `199${i}-0${i + 3}-1${i}`,
      address: { street, postcode, city },
      phone: `0151 0000000${i}`,
      email: `${first.toLowerCase()}@example.com`,
      insuranceType: insType,
      insurerName: insurer,
      insuranceNumber: `Z00000000${i}`,
      dueDate: postpartum ? addDays(-10 - i * 5) : addDays(30 + i * 20),
      services: postpartum ? ['postpartum', 'breastfeeding'] : ['pregnancy', 'birthPrep', 'postpartum'],
      preferredContact: i % 2 ? 'email' : 'phone',
      message: 'Demo-Eintrag – keine echte Person.',
      privacyConsent: true,
      status: i === 4 ? 'pending' : 'active',
    });
    if (i === 4) continue;

    await store.create<CareCasePayload>('careCase', {
      patientId: patient.id,
      phase: postpartum ? 'postpartum' : 'pregnancy',
      startDate: addDays(postpartum ? -12 - i * 5 : -40),
    });

    let childId: string | undefined;
    if (postpartum) {
      const child = await store.create<ChildPayload>('child', {
        patientId: patient.id,
        name: i === 0 ? 'Paul' : 'Ida',
        sex: i === 0 ? 'male' : 'female',
        birthDate: addDays(-12 - i * 5),
        birthTime: '03:4' + i,
        birthWeightG: 3420 - i * 200,
        lengthCm: 51 - i,
        headCircumferenceCm: 35,
        apgar: { min1: 8, min5: 9, min10: 10 },
        birthMode: i === 0 ? 'spontan' : 'Sectio',
        placeOfBirth: 'Klinik',
        insurerName: insurer,
        insuranceNumber: `Z10000000${i}`,
      });
      childId = child.id;
    }

    for (let v = 0; v < 3; v++) {
      await store.create<VisitPayload>('visit', {
        patientId: patient.id,
        date: addDays(-v * 3 - 1),
        startTime: '10:00',
        endTime: v === 0 ? '10:50' : '10:35',
        location: v === 2 ? 'phone' : 'home',
        seen: postpartum ? 'both' : 'mother',
        childId,
        phase: postpartum ? 'postpartum' : 'pregnancy',
        motherVitals: { bp: '118/76', pulse: 72, tempC: 36.8 },
        childVitals: postpartum ? { weightG: 3350 + v * 40, feeding: 'gestillt' } : undefined,
        notes: 'Demo-Besuch.',
        billingCodes: postpartum ? ['DEMO-WB'] : ['DEMO-VS'],
        travelKm: v === 2 ? 0 : 6 + i,
      });
    }

    if (postpartum) {
      await store.create<InvoicePayload>('invoice', {
        patientId: patient.id,
        payer: insurer,
        from: addDays(-30),
        to: addDays(-1),
        lines: [{ date: addDays(-7), code: 'DEMO-WB', label: 'Wochenbettbesuch (Beispiel)', units: 7, amount: 42 }],
        travelCost: 4.2,
        total: 46.2,
        status: 'draft',
      });
    }
  }
  return PEOPLE.length;
}
