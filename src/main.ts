import './style.css';
import { startAutoLock } from './autolock';
import { installErrorLog } from './diagnostics';
import { isStandalone, requestPersistence } from './platform';
import { homeScreen } from './screens/home';
import { installScreen, setupScreen } from './screens/onboarding';
import { unlockScreen } from './screens/unlock';
import { hasVault, isUnlocked, lock } from './vault';

let persistDenied = false;

// Browser test mode: lets you try the app without installing it. Only a flag, no data.
const TEST_MODE = 'testMode';
const testMode = () => sessionStorage.getItem(TEST_MODE) === '1';

async function route(): Promise<void> {
  if (!(await hasVault())) {
    if (!isStandalone() && !testMode()) {
      return installScreen(() => {
        sessionStorage.setItem(TEST_MODE, '1');
        void route();
      });
    }
    return setupScreen(() => void route());
  }
  if (!isUnlocked()) return unlockScreen(() => void route());
  persistDenied = !(await requestPersistence());
  await homeScreen({ onLock: lockNow, persistDenied });
}

function lockNow(): void {
  lock();
  void route();
}

installErrorLog();
startAutoLock(() => void route());
void route();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
}
