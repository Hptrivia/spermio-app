// Data model: every record is an append-only, versioned entry.
// Edits add a new version; deletes add a tombstone version. Merging two devices
// is a union by (id, version), and the current state is the highest version per id.

export type EntryType = 'patient' | 'careCase' | 'child' | 'visit' | 'invoice' | 'note';

export interface Entry<P = unknown> {
  id: string;
  type: EntryType;
  version: number;
  createdAt: string;
  updatedAt: string;
  deviceId: string;
  deleted: boolean;
  payload: P;
}

export interface Address {
  street: string;
  postcode: string;
  city: string;
}

export interface PatientPayload {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  address: Address;
  phone: string;
  email: string;
  insuranceType: 'statutory' | 'private';
  insurerName: string;
  insuranceNumber: string;
  dueDate: string;
  services: string[];
  preferredContact: 'phone' | 'email' | 'sms';
  message: string;
  privacyConsent: boolean;
  status: 'pending' | 'active' | 'archived';
}

export interface CareCasePayload {
  patientId: string;
  phase: 'pregnancy' | 'birth' | 'postpartum';
  startDate: string;
  endDate?: string;
}

export interface ChildPayload {
  patientId: string;
  name: string;
  sex: 'female' | 'male' | 'diverse';
  birthDate: string;
  birthTime: string;
  birthWeightG: number;
  lengthCm: number;
  headCircumferenceCm: number;
  apgar: { min1: number; min5: number; min10: number };
  birthMode: string;
  placeOfBirth: string;
  insurerName: string;
  insuranceNumber: string;
}

export interface VisitPayload {
  patientId: string;
  date: string;
  startTime: string;
  endTime: string;
  location: 'home' | 'practice' | 'video' | 'phone';
  seen: 'mother' | 'child' | 'both';
  childId?: string;
  phase: 'pregnancy' | 'birth' | 'postpartum';
  motherVitals?: { bp?: string; pulse?: number; tempC?: number; weightKg?: number };
  childVitals?: { weightG?: number; tempC?: number; feeding?: string; notes?: string };
  notes: string;
  billingCodes: string[];
  travelKm: number;
}

export interface InvoiceLine {
  date: string;
  code: string;
  label: string;
  units: number;
  amount: number;
}

export interface InvoicePayload {
  patientId: string;
  payer: string;
  from: string;
  to: string;
  lines: InvoiceLine[];
  travelCost: number;
  total: number;
  status: 'draft' | 'sent' | 'paid';
  pdf?: { fileName: string; createdAt: string };
}

export interface NotePayload {
  patientId: string;
  date: string;
  text: string;
}
