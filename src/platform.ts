export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

export function isIOS(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Asks the browser not to evict our storage. Returns whether storage is persistent. */
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  return (await navigator.storage.persisted()) || navigator.storage.persist();
}

export function downloadText(fileName: string, text: string, type = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Share sheet on iPhone (Save to Files / AirDrop / Mail), download elsewhere. */
export async function shareOrDownload(fileName: string, text: string, type = 'text/plain'): Promise<void> {
  const file = new File([text], fileName, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  downloadText(fileName, text, type);
}
