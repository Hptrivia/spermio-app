import type { FieldDef } from './forms';
import { t } from './strings/de';

const f = t.fields;
const o = t.options;

/** Patient fields. The same list will drive the patient's own intake form. */
export const patientFields: FieldDef[] = [
  { section: f.personal },
  { key: 'firstName', label: f.firstName, type: 'text', required: true, half: true },
  { key: 'lastName', label: f.lastName, type: 'text', required: true, half: true },
  { key: 'dateOfBirth', label: f.dateOfBirth, type: 'date' },
  { key: 'address.street', label: f.street, type: 'text' },
  { key: 'address.postcode', label: f.postcode, type: 'text', half: true },
  { key: 'address.city', label: f.city, type: 'text', half: true },
  { key: 'phone', label: f.phone, type: 'tel', half: true },
  { key: 'email', label: f.email, type: 'email', half: true },
  { key: 'preferredContact', label: f.preferredContact, type: 'radio', options: o.preferredContact },
  { section: f.insuranceType },
  { key: 'insuranceType', label: f.insuranceType, type: 'radio', options: o.insuranceType },
  { key: 'insurerName', label: f.insurerName, type: 'text' },
  { key: 'insuranceNumber', label: f.insuranceNumber, type: 'text' },
  { section: f.pregnancy },
  { key: 'dueDate', label: f.dueDate, type: 'date' },
  { key: 'services', label: f.services, type: 'checks', options: o.services },
  { key: 'message', label: f.message, type: 'textarea' },
];

export const patientStatusField: FieldDef = { key: 'status', label: f.status, type: 'radio', options: o.status };

export const visitFields = (children: Record<string, string>): FieldDef[] => [
  { key: 'date', label: f.date, type: 'date', required: true },
  { key: 'startTime', label: f.startTime, type: 'time', required: true, half: true },
  { key: 'endTime', label: f.endTime, type: 'time', required: true, half: true },
  { key: 'phase', label: f.phase, type: 'radio', options: o.phase, required: true },
  { key: 'location', label: f.location, type: 'radio', options: o.location, required: true },
  { key: 'seen', label: f.seen, type: 'radio', options: o.seen, required: true },
  {
    key: 'childId',
    label: f.whichChild,
    type: 'select',
    options: children,
    showIf: (v) => v.seen !== 'mother' && Object.keys(children).length > 0,
  },
  { key: 'travelKm', label: f.travelKm, type: 'number', step: '0.1', showIf: (v) => v.location === 'home' },
  { key: 'notes', label: f.notes, type: 'textarea' },
  { section: t.visit.motherVitals },
  { key: 'motherVitals.bp', label: f.bp, type: 'text', half: true },
  { key: 'motherVitals.pulse', label: f.pulse, type: 'number', half: true },
  { key: 'motherVitals.tempC', label: f.temp, type: 'number', step: '0.1', half: true },
  { key: 'motherVitals.weightKg', label: f.weightKg, type: 'number', step: '0.1', half: true },
  { section: t.visit.childVitals },
  { key: 'childVitals.weightG', label: f.weightG, type: 'number', half: true },
  { key: 'childVitals.tempC', label: f.temp, type: 'number', step: '0.1', half: true },
  { key: 'childVitals.feeding', label: f.feeding, type: 'text' },
  { key: 'childVitals.notes', label: f.childNotes, type: 'textarea' },
];

export const childFields: FieldDef[] = [
  { key: 'name', label: f.childName, type: 'text', required: true },
  { key: 'sex', label: f.sex, type: 'radio', options: o.sex },
  { key: 'birthDate', label: f.birthDate, type: 'date', required: true, half: true },
  { key: 'birthTime', label: f.birthTime, type: 'time', half: true },
  { key: 'birthWeightG', label: f.birthWeightG, type: 'number', half: true },
  { key: 'lengthCm', label: f.lengthCm, type: 'number', step: '0.5', half: true },
  { key: 'headCircumferenceCm', label: f.headCm, type: 'number', step: '0.5', half: true },
  { key: 'apgar.min1', label: f.apgar1, type: 'number', step: '1', half: true },
  { key: 'apgar.min5', label: f.apgar5, type: 'number', step: '1', half: true },
  { key: 'apgar.min10', label: f.apgar10, type: 'number', step: '1', half: true },
  { key: 'birthMode', label: f.birthMode, type: 'select', options: o.birthMode },
  { key: 'placeOfBirth', label: f.placeOfBirth, type: 'select', options: o.placeOfBirth },
  { key: 'insurerName', label: f.childInsurer, type: 'text' },
  { key: 'insuranceNumber', label: f.childInsuranceNumber, type: 'text' },
];

export const noteFields: FieldDef[] = [
  { key: 'date', label: f.date, type: 'date', required: true },
  { key: 'text', label: f.text, type: 'textarea', required: true },
];
