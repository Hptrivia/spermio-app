import { counts } from './store';

declare const __APP_VERSION__: string;
export const APP_VERSION = __APP_VERSION__;

// Error messages only, never stack data that could include patient values.
const errors: { at: string; message: string }[] = [];

export function installErrorLog(): void {
  const log = (message: string) => {
    errors.push({ at: new Date().toISOString(), message: message.slice(0, 200) });
    if (errors.length > 50) errors.shift();
  };
  window.addEventListener('error', (e) => log(e.message));
  window.addEventListener('unhandledrejection', (e) => log(String((e.reason as Error)?.name ?? 'rejection')));
}

export async function diagnosticsReport(): Promise<string> {
  return JSON.stringify(
    {
      appVersion: APP_VERSION,
      createdAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      standalone: window.matchMedia('(display-mode: standalone)').matches,
      persisted: await navigator.storage?.persisted?.(),
      recordCounts: await counts(),
      errors,
    },
    null,
    2,
  );
}
