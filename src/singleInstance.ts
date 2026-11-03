import { isNativeShell } from './pwa/pwa';

/**
 * Browser / installed-PWA only: allow ONE open copy of the app per browser profile.
 * An installed window and a browser tab (or two tabs) share the same IndexedDB but each keeps its own in-memory
 * copy, so two at once can overwrite each other's data (e.g. the unsent-sales outbox). The Web Locks API gives us
 * a lock that is released automatically when the page closes or crashes.
 *
 * Returns true if this copy may run, false if another copy already holds the lock.
 * Where Web Locks is not available (very old browsers) or in the Android / Windows apps, it simply allows the app.
 */
const LOCK_NAME = 'mjtech-pos-single-instance';

export async function claimSingleInstance(): Promise<boolean> {
  if (import.meta.env.DEV || isNativeShell() || !('locks' in navigator)) return true;
  // A reload (e.g. after "Update") can start before the old page has released its lock: retry briefly.
  for (let i = 0; i < 8; i++) {
    const got = await new Promise<boolean>(resolve => {
      navigator.locks.request(LOCK_NAME, { ifAvailable: true }, lock => {
        if (!lock) { resolve(false); return; }
        resolve(true);
        return new Promise<void>(() => { /* never settles: hold the lock until this page closes */ });
      }).catch(() => resolve(true)); // never block the till because of a locking problem
    });
    if (got) return true;
    await new Promise(r => setTimeout(r, 400));
  }
  return false;
}
