import { isUnlocked, lock } from './vault';

const IDLE_MS = 5 * 60_000;
const HIDDEN_MS = 60_000;

let timer: number | undefined;
let hiddenAt = 0;

/** Locks after inactivity, or when the app comes back after being in the background a while. */
export function startAutoLock(onLock: () => void): void {
  const doLock = () => {
    if (!isUnlocked()) return;
    lock();
    onLock();
  };
  const reset = () => {
    clearTimeout(timer);
    timer = window.setTimeout(doLock, IDLE_MS);
  };
  for (const ev of ['pointerdown', 'keydown', 'scroll', 'touchstart']) {
    window.addEventListener(ev, reset, { passive: true });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > HIDDEN_MS) doLock();
  });
  reset();
}
