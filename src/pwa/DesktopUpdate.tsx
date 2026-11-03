import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';

/**
 * Windows app only (window.electronUpdater comes from electron/preload.cjs). The new version has already been
 * downloaded in the background; the owner picks the moment to restart. If they ignore it, it installs by itself
 * the next time the app is closed.
 */
interface UpdaterState { state: 'idle' | 'checking' | 'downloading' | 'ready' | 'error'; current: string; version: string | null; percent: number }

export default function DesktopUpdate() {
  const api = (window as any).electronUpdater;
  const [s, setS] = useState<UpdaterState | null>(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!api) return;
    api.getState().then(setS).catch(() => {});
    return api.onStatus(setS);
  }, []);

  if (!api || !s || s.state !== 'ready' || hidden) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[1000] flex justify-center px-3 pointer-events-none">
      <div className="pointer-events-auto mt-2 flex w-full max-w-md items-center gap-3 rounded-xl border border-slate-700 bg-slate-800 p-3 text-sm text-slate-100 shadow-2xl" role="status">
        <RefreshCw size={18} className="shrink-0 text-amber-400" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Update {s.version} is ready</div>
          <div className="text-xs text-slate-400">Finish any sale in progress, then restart. Otherwise it installs when you close the app. Your data is kept.</div>
        </div>
        <button disabled={busy} onClick={() => { setBusy(true); api.install(); }}
          className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-300 disabled:opacity-60">
          {busy ? 'Restarting…' : 'Restart now'}
        </button>
        <button onClick={() => setHidden(true)} aria-label="Later" className="text-slate-400 hover:text-slate-100"><X size={16} /></button>
      </div>
    </div>
  );
}
