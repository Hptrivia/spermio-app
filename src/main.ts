import './style.css';
import { startAutoLock } from './autolock';
import { installErrorLog } from './diagnostics';
import { isStandalone, requestPersistence } from './platform';
import { homeScreen } from './screens/home';
import { unlockScreen } from './screens/unlock';
import { createTestVault, hasVault, isTestVault, isUnlocked, lock, unlockTestVault } from './vault';

let persistDenied = false;

// Test phase: no password, no recovery code, no install requirement.
// The real onboarding (screens/onboarding.ts) comes back before real patient data.
async function route(): Promise<void> {
  if (!(await hasVault())) await createTestVault();
  const testVault = await isTestVault();
  if (!isUnlocked()) {
    if (testVault) await unlockTestVault();
    else return unlockScreen(() => void route());
  }
  persistDenied = isStandalone() && !(await requestPersistence());
  await homeScreen({ onLock: lockNow, persistDenied, testVault });
}

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
