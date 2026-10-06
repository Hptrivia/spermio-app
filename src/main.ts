import './style.css';
import { startAutoLock } from './autolock';
import { installErrorLog } from './diagnostics';
import { isStandalone, requestPersistence } from './platform';
import { currentRoute } from './router';
import { homeScreen, settingsScreen } from './screens/home';
import { invoiceNewScreen, invoiceScreen } from './screens/invoice';
import { entryFormScreen, patientFormScreen, patientScreen } from './screens/patient';
import { unlockScreen } from './screens/unlock';
import { createTestVault, hasVault, isTestVault, isUnlocked, lock, unlockTestVault } from './vault';

let persistDenied: boolean | undefined;

// Test phase: no password, no recovery code, no install requirement.
// The real onboarding (screens/onboarding.ts) comes back before real patient data.
async function route(): Promise<void> {
  if (!(await hasVault())) await createTestVault();
  const testVault = await isTestVault();
  if (!isUnlocked()) {
    if (testVault) await unlockTestVault();
    else return unlockScreen(() => void route());
  }
  persistDenied ??= isStandalone() && !(await requestPersistence());
  const ctx = { onLock: lockNow, persistDenied, testVault };
  const { name, params } = currentRoute();
  switch (name) {
    case 'settings': return settingsScreen(ctx);
    case 'patientNew': return patientFormScreen();
    case 'patient': return patientScreen(params.pid);
    case 'patientEdit': return patientFormScreen(params.pid);
    case 'invoiceNew': return invoiceNewScreen(params.pid);
    case 'invoice': return invoiceScreen(params.pid, params.iid);
    case 'entryNew': return entryFormScreen(params.kind as 'visit', params.pid);
    case 'entryEdit': return entryFormScreen(params.kind as 'visit', params.pid, params.eid);
    default: return homeScreen(ctx);
  }
}

window.addEventListener('hashchange', () => void route());

function lockNow(): void {
  lock();
  void route();
}

installErrorLog();
void isTestVault().then((test) => test || startAutoLock(() => void route()));
void route();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
}
