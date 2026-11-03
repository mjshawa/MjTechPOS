import React, { useState } from 'react';
import PasswordInput from '../auth/PasswordInput';
import { X, RefreshCw } from 'lucide-react';
import { storageName } from '../storage';

export default function SyncModal({ sync, onClose }: { sync: any; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');

  const input = 'w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-200 mt-1 focus:outline-none focus:border-amber-500';
  const last = sync.lastSync ? new Date(sync.lastSync).toLocaleString() : 'never';

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-4 sm:p-6 space-y-5 shadow-2xl text-slate-200">
        <div className="flex justify-between items-center">
          <h3 className="text-xl font-extrabold">Cloud Sync</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X className="h-5 w-5" /></button>
        </div>

        <div className="text-xs space-y-1 bg-slate-950 border border-slate-800 rounded-2xl p-4">
          <p>Saved on this device: <span className="font-mono text-amber-400">{storageName()}</span></p>
          <p>Status: <span className="font-bold">{sync.label}</span></p>
          <p>Waiting to upload: {sync.pending}{sync.failed ? ` (+${sync.failed} rejected)` : ''}</p>
          <p>Last upload: {last}</p>
          {sync.failed > 0 && sync.session && (
            <button onClick={sync.retryFailed} className="mt-1 px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-bold rounded-lg">Try the {sync.failed} rejected again</button>
          )}
          {sync.error && <p className="text-rose-400 break-words">Last problem: {sync.error}</p>}
        </div>

        {!sync.configured && (
          <p className="text-xs text-slate-400">
            Online backup is not set up. Your sales are saved safely on this device. Add VITE_SUPABASE_URL and
            VITE_SUPABASE_ANON_KEY to <span className="font-mono">.env</span> and rebuild to enable sync.
          </p>
        )}

        {sync.configured && !sync.session && (
          <div className="space-y-3">
            <div><label className="text-xs text-slate-400 font-bold">Staff email</label>
              <input className={input} type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
            <div><label className="text-xs text-slate-400 font-bold">Password</label>
              <PasswordInput className={input} value={password} onChange={e => setPassword(e.target.value)} /></div>
            {msg && <p className="text-xs text-rose-400">{msg}</p>}
            <button
              onClick={async () => { setMsg(''); const err = await sync.signIn(email, password); if (err) setMsg(err); }}
              className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-sm rounded-2xl"
            >Sign in</button>
            <p className="text-[11px] text-slate-500">You only need internet for this once. The app keeps working offline afterwards.</p>
          </div>
        )}

        {sync.configured && sync.session && (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">Signed in as {sync.session.user.email}</p>
            <div className="flex gap-2">
              <button onClick={sync.syncNow} disabled={sync.busy}
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-extrabold text-sm rounded-2xl flex items-center justify-center gap-2">
                <RefreshCw className={`h-4 w-4 ${sync.busy ? 'animate-spin' : ''}`} /> Sync now
              </button>
              <button onClick={sync.signOut}
                className="px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm rounded-2xl">Sign out</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
