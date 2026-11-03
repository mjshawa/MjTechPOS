import { Capacitor } from '@capacitor/core';

/**
 * Progressive Web App plumbing: registers the service worker, tracks "update ready" and "can install".
 * Does nothing inside the Android (Capacitor) or Windows (Electron) apps, or during `npm run dev`.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface PwaState {
  updateReady: boolean;                          // a new version has downloaded and is waiting
  installEvent: BeforeInstallPromptEvent | null; // set when the browser lets us show its install dialog
}

let state: PwaState = { updateReady: false, installEvent: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<PwaState>) => { state = { ...state, ...patch }; listeners.forEach(l => l()); };

export const getPwaState = () => state;
export const subscribePwa = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** True inside the Android / Windows apps, where the PWA layer must stay out of the way. */
export const isNativeShell = () =>
  Capacitor.isNativePlatform() || !!(window as any).electronSQLite || location.protocol === 'file:';

/** True when the app is already running as an installed PWA (own window, no browser bar). */
export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;

export const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

let registration: ServiceWorkerRegistration | null = null;

/** Tell the waiting service worker to take over, then reload once it has. Called from the "Update" button. */
export function applyUpdate() {
  const waiting = registration?.waiting;
  if (!waiting) { location.reload(); return; }
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

/** Shows the browser's own install dialog. Returns true if the person accepted. */
export async function promptInstall(): Promise<boolean> {
  const ev = state.installEvent;
  if (!ev) return false;
  await ev.prompt();
  const { outcome } = await ev.userChoice;
  set({ installEvent: null }); // the event can only be used once
  return outcome === 'accepted';
}

/** Ask the browser not to evict our data when the device is short on space. Matters for a till. */
async function keepDataSafe() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch { /* not supported, fine */ }
}

export function startPwa() {
  if (import.meta.env.DEV || isNativeShell()) return;

  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); set({ installEvent: e as BeforeInstallPromptEvent }); });
  window.addEventListener('appinstalled', () => set({ installEvent: null }));
  keepDataSafe();

  if (!('serviceWorker' in navigator)) return; // not https, or a very old browser

  const go = async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      registration = reg;

      // An update only counts when an older worker is already controlling the page (otherwise it is the first install).
      const check = () => { if (reg.waiting && navigator.serviceWorker.controller) set({ updateReady: true }); };
      check();
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => { if (w.state === 'installed') check(); });
      });

      // Look for a new version now and then: hourly, and whenever the app comes back to the screen or online.
      const poll = () => { reg.update().catch(() => { /* offline */ }); };
      setInterval(poll, 60 * 60 * 1000);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') poll(); });
      window.addEventListener('online', poll);
    } catch (e) {
      console.warn('[pwa] service worker not registered', e);
    }
  };
  if (document.readyState === 'complete') go(); else window.addEventListener('load', go);
}
