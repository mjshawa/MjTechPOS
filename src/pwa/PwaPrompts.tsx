import { useState, useSyncExternalStore } from 'react';
import { Download, RefreshCw, Share, X } from 'lucide-react';
import { applyUpdate, getPwaState, isIos, isNativeShell, isStandalone, promptInstall, subscribePwa } from './pwa';

/**
 * Small toast at the top of the screen (above everything, also on the sign-in page):
 *  - "New version ready": the owner chooses when to reload, so a sale in progress is never interrupted.
 *  - "Install": one tap on Android / desktop Chrome / Edge; a short how-to on iPhone and iPad (Safari has no install button).
 * Dismissing the install tip hides it for two weeks.
 */
const DISMISS_KEY = 'mjtech.pwa.installDismissedAt';
const HIDE_DAYS = 14;

const dismissedRecently = () => {
  try { const t = Number(localStorage.getItem(DISMISS_KEY)); return !!t && Date.now() - t < HIDE_DAYS * 864e5; } catch { return false; }
};

export default function PwaPrompts() {
  const pwa = useSyncExternalStore(subscribePwa, getPwaState);
  const [hideUpdate, setHideUpdate] = useState(false);
  const [hideInstall, setHideInstall] = useState(dismissedRecently);

  if (isNativeShell()) return null;

  const shell = 'fixed inset-x-0 top-0 z-[1000] flex justify-center px-3 pointer-events-none';
  const card = 'pointer-events-auto mt-2 flex w-full max-w-md items-center gap-3 rounded-xl border border-slate-700 bg-slate-800 p-3 text-sm text-slate-100 shadow-2xl';
  const pad = { paddingTop: 'env(safe-area-inset-top, 0px)' };

  if (pwa.updateReady && !hideUpdate) {
    return (
      <div className={shell} style={pad}>
        <div className={card} role="status">
          <RefreshCw size={18} className="shrink-0 text-amber-400" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">New version ready</div>
            <div className="text-xs text-slate-400">Finish any sale in progress, then update. Your data is kept.</div>
          </div>
          <button onClick={applyUpdate} className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-300">Update</button>
          <button onClick={() => setHideUpdate(true)} aria-label="Later" className="text-slate-400 hover:text-slate-100"><X size={16} /></button>
        </div>
      </div>
    );
  }

  if (isStandalone() || hideInstall) return null;

  const dismiss = () => { try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ } setHideInstall(true); };

  if (pwa.installEvent) {
    return (
      <div className={shell} style={pad}>
        <div className={card} role="status">
          <Download size={18} className="shrink-0 text-amber-400" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">Install MjTech POS</div>
            <div className="text-xs text-slate-400">Opens full screen, starts faster and works offline.</div>
          </div>
          <button onClick={async () => { if (await promptInstall()) setHideInstall(true); }}
            className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-300">Install</button>
          <button onClick={dismiss} aria-label="Not now" className="text-slate-400 hover:text-slate-100"><X size={16} /></button>
        </div>
      </div>
    );
  }

  if (isIos()) {
    return (
      <div className={shell} style={pad}>
        <div className={card} role="status">
          <Share size={18} className="shrink-0 text-amber-400" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">Install on this device</div>
            <div className="text-xs text-slate-400">Tap the Share button in Safari, then <b>Add to Home Screen</b>.</div>
          </div>
          <button onClick={dismiss} aria-label="Got it" className="text-slate-400 hover:text-slate-100"><X size={16} /></button>
        </div>
      </div>
    );
  }

  return null;
}
