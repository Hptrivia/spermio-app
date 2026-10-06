import * as store from './store';
import type { CareCasePayload, ChildPayload, PatientPayload, VisitPayload } from './types';

// Obviously fake people. Insurance numbers use the "Z" prefix so they can't collide with real ones.
const PEOPLE = [
  ['Lena', 'Musterfrau', 'Musterweg 1', '10115', 'Berlin', 'statutory', 'Beispiel-Krankenkasse'],
  ['Sophie', 'Beispiel', 'Probestraße 7', '20095', 'Hamburg', 'statutory', 'Test-BKK'],
  ['Mia', 'Testmann', 'Demoallee 12', '80331', 'München', 'private', 'Muster Privatversicherung'],
  ['Hanna', 'Fiktiv', 'Am Platzhalter 3', '50667', 'Köln', 'statutory', 'Beispiel-Krankenkasse'],
  ['Emilia', 'Erfunden', 'Scheinweg 22', '60311', 'Frankfurt', 'statutory', 'Test-BKK'],
] as const;

const DEMO_MESSAGE = 'Demo-Eintrag – keine echte Person.';
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (days: number) => iso(new Date(Date.now() + days * 86_400_000));

/** Creates fake patients with care cases, children and visits. Returns patient count. */
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
      message: DEMO_MESSAGE,
      privacyConsent: true,
      status: i === 4 ? 'pending' : 'active',
      demo: true,
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
        birthMode: i === 0 ? 'spontan' : 'sectio',
        placeOfBirth: 'clinic',
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
        location: v === 2 ? 'video' : 'home',
        seen: postpartum ? 'both' : 'mother',
        childId,
        phase: postpartum ? 'postpartum' : 'pregnancy',
        motherVitals: { bp: '118/76', pulse: 72, tempC: 36.8 },
        childVitals: postpartum ? { weightG: 3350 + v * 40, feeding: 'gestillt' } : undefined,
        notes: ['Demo-Besuch. Alles unauffällig.', 'Demo-Besuch. Fragen zur Ernährung besprochen.', 'Demo: telefonische Rückfrage.'][v],
        billingCodes: postpartum ? [i === 0 ? '303' : '301'] : v === 0 ? ['102', '101'] : ['101'],
        materials: !postpartum && v === 0 ? ['60200'] : [],
        travelKm: v === 2 ? 0 : 6 + i,
      });
    }

  }
  return PEOPLE.length;
}


/** Deletes the demo patients and everything attached to them. Returns how many patients were removed. */
export async function removeDemoData(): Promise<number> {
  const demo = (await store.list<PatientPayload>('patient')).filter((p) => p.payload.demo || p.payload.message === DEMO_MESSAGE);
  const ids = new Set(demo.map((p) => p.id));
  for (const type of ['visit', 'child', 'note', 'careCase', 'invoice'] as const) {
    for (const e of await store.list<{ patientId: string }>(type)) if (ids.has(e.payload.patientId)) await store.remove(e);
  }
  for (const p of demo) await store.remove(p);
  return demo.length;
}
