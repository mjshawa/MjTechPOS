import React, { useEffect, useState } from 'react';
import PasswordInput from './PasswordInput';
import { BRAND, EMPTY_BUSINESS } from '../brand';
import { Zap, Sun, Moon } from 'lucide-react';
import { usePersistentCollection, usePersistentState } from '../storage';
import { supabase } from '../sync/supabase';
import { hashPassword, newSalt, uid } from './crypto';

export type Role = 'owner' | 'staff';
export type Workspace = 'bar' | 'retail';
export interface User { id: string; email: string; name: string; role: Role }

// Owner recovery code: lets the OWNER set a new password on this device with no internet or email.
// Change it per venue with VITE_OWNER_RECOVERY_CODE in .env (default below).
const OWNER_RECOVERY_CODE = ((import.meta.env.VITE_OWNER_RECOVERY_CODE as string | undefined) || '2026DC').trim();
const norm = (s: string) => s.trim().toLowerCase();
const isNetworkError = (e: any) => !navigator.onLine || e?.name === 'AuthRetryableFetchError' || /fetch|network|timeout/i.test(e?.message || '');

/**
 * Sign-in screen in front of the whole app.
 *  • Pick the WORKSPACE (Bar or Wholesale: completely separate stock, sales, tabs, shifts) and the ROLE (Owner or Staff).
 *    An account can only enter as Owner if it IS an owner; an owner may also enter as Staff.
 *  • Cloud mode (Supabase configured): email + password checked online, then cached on the device so the same person
 *    can sign in OFFLINE later. Local mode (no Supabase): first run creates the owner on this device.
 *  • Forgot password: emailed 6-digit code, or the owner recovery code (offline).
 */
export default function AuthGate({ theme, onToggleTheme, children }: {
  theme: string; onToggleTheme: () => void; children: (auth: any) => React.ReactNode;
}) {
  const [staff, setStaff] = usePersistentCollection('staff', []);
  const [business] = usePersistentState('business', EMPTY_BUSINESS);
  const bizName = (business?.name || '').trim();
  const [session, setSession] = usePersistentState('auth:session', null);
  const [workspace, setWorkspace] = usePersistentState('auth:lastWorkspace', 'bar');
  const [asRole, setAsRole] = usePersistentState('auth:lastRole', 'staff');
  const [screen, setScreen] = useState<'login' | 'recover'>('login');
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [method, setMethod] = useState<'email' | 'owner'>(supabase ? 'email' : 'owner');
  const [fails, setFails] = usePersistentState('auth:recoveryFails', { count: 0, until: 0 });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  // Cloud mode: whenever the device is online, mirror the cloud list of people. A person removed in the Team screen is dropped
  // from this device (so they cannot sign in offline any more), and names / roles changed by the owner are picked up.
  useEffect(() => {
    if (!supabase || !session) return;
    let stop = false;
    const refresh = async () => {
      if (!navigator.onLine) return;
      const { data, error } = await supabase!.from('profiles').select('id, name, role');
      if (stop || error || !data || data.length === 0) return;   // never wipe anything on an error or an empty answer
      const live = new Map<string, any>(data.map((p: any) => [p.id, p]));
      setStaff((prev: any[]) => {
        const next = prev.filter(s => live.has(s.id)).map(s => {
          const p = live.get(s.id);
          return p && (p.name !== s.name || p.role !== s.role) ? { ...s, name: p.name || s.name, role: p.role === 'owner' ? 'owner' : 'staff' } : s;
        });
        return next.length === prev.length && next.every((s, i) => s === prev[i]) ? prev : next;
      });
    };
    refresh();
    const t = setInterval(refresh, 5 * 60000);
    window.addEventListener('online', refresh);
    return () => { stop = true; clearInterval(t); window.removeEventListener('online', refresh); };
  }, [session?.id]);

  const account = session ? staff.find((s: any) => s.id === session.id) : null;
  if (account && session) {
    const user: User = {
      id: account.id, email: account.email, name: account.name,
      role: account.role === 'owner' && session.role === 'owner' ? 'owner' : 'staff', // never above the account's real role
    };
    return <>{children({ user, workspace: session.workspace, logout: () => setSession(null), staff, setStaff })}</>;
  }

  const cacheAccount = async (u: User, pw: string): Promise<User> => {
    let salt = '', hash = '';
    try { salt = newSalt(); hash = await hashPassword(pw, salt); } catch { /* no WebCrypto: online-only login */ }
    setStaff((prev: any[]) => [...prev.filter(s => s.id !== u.id), { ...u, salt, hash }]);
    return u;
  };

  const finishCloudLogin = async (authUser: any, mail: string, pw: string): Promise<User> => {
    const cached = staff.find((s: any) => s.id === authUser.id);
    const { data: prof } = await supabase!.from('profiles').select('name, role').eq('id', authUser.id).maybeSingle();
    return cacheAccount({
      id: authUser.id, email: mail,
      name: prof?.name || cached?.name || mail.split('@')[0],
      role: ((prof?.role ?? cached?.role) === 'owner' ? 'owner' : 'staff') as Role,
    }, pw);
  };

  /** Final gate: workspace + role chosen on the sign-in screen. */
  const enter = (acc: { id: string; role: string }, role: Role = asRole) => {
    if (role === 'owner' && acc.role !== 'owner') { setMsg('This account is staff-only. Choose "Staff" above to sign in.'); return false; }
    setSession({ id: acc.id, workspace, role });
    return true;
  };

  const offlineLogin = async (mail: string, pw: string) => {
    const acc = staff.find((s: any) => norm(s.email) === mail);
    if (!acc) { setMsg(supabase ? 'This account has not signed in on this device before. Connect to the internet to sign in the first time.' : 'Unknown account.'); return; }
    let ok = false;
    try { ok = !!acc.hash && (await hashPassword(pw, acc.salt)) === acc.hash; } catch { /* ignore */ }
    if (!ok) { setMsg('Wrong email or password.'); return; }
    enter(acc);
  };

  const run = async (fn: () => Promise<void>) => { setBusy(true); setMsg(''); setInfo(''); try { await fn(); } catch (e: any) { setMsg(e?.message || String(e)); } finally { setBusy(false); } };

  const login = (e: React.FormEvent) => { e.preventDefault(); run(async () => {
    const mail = norm(email);
    if (supabase && navigator.onLine) {
      const { data, error } = await supabase.auth.signInWithPassword({ email: mail, password });
      if (!error && data.user) { enter(await finishCloudLogin(data.user, mail, password)); return; }
      if (error && !isNetworkError(error)) {
        // Password was reset on THIS device with the owner recovery code: cloud still has the old one.
        if (staff.find((s: any) => norm(s.email) === mail && s.localReset)) { await offlineLogin(mail, password); return; }
        setMsg(error.message); return;
      }
    }
    await offlineLogin(mail, password);
  }); };

  const setupOwner = (e: React.FormEvent) => { e.preventDefault(); run(async () => {
    if (password.length < 6) { setMsg('Password must be at least 6 characters.'); return; }
    const u = await cacheAccount({ id: uid(), email: norm(email), name: name.trim() || 'Owner', role: 'owner' }, password);
    setSession({ id: u.id, workspace, role: 'owner' });
  }); };

  const sendCode = (e: React.FormEvent) => { e.preventDefault(); run(async () => {
    const { error } = await supabase!.auth.resetPasswordForEmail(norm(email));
    if (error) { setMsg(error.message); return; }
    setStage('code'); setInfo('If that email has an account, a 6-digit code is on its way.');
  }); };

  const resetPassword = (e: React.FormEvent) => { e.preventDefault(); run(async () => {
    if (password.length < 6) { setMsg('New password must be at least 6 characters.'); return; }
    const mail = norm(email);
    const { data, error } = await supabase!.auth.verifyOtp({ email: mail, token: code.trim(), type: 'recovery' });
    if (error || !data.user) { setMsg(error?.message || 'The code is wrong or has expired.'); return; }
    const { error: e2 } = await supabase!.auth.updateUser({ password });
    if (e2) { setMsg(e2.message); return; }
    enter(await finishCloudLogin(data.user, mail, password));
  }); };

  const ownerRecover = (e: React.FormEvent) => { e.preventDefault(); run(async () => {
    if (Date.now() < fails.until) { setMsg(`Too many wrong codes. Try again in ${Math.ceil((fails.until - Date.now()) / 60000)} min.`); return; }
    if (password.length < 6) { setMsg('New password must be at least 6 characters.'); return; }
    if (code.trim().toUpperCase() !== OWNER_RECOVERY_CODE.toUpperCase()) {
      const count = fails.count + 1;
      setFails(count >= 5 ? { count: 0, until: Date.now() + 10 * 60000 } : { count, until: 0 });
      setMsg('Wrong recovery code.'); return;
    }
    const acc = staff.find((s: any) => norm(s.email) === norm(email) && s.role === 'owner');
    if (!acc) { setMsg('No owner account with that email on this device.'); return; }
    const salt = newSalt();
    const hash = await hashPassword(password, salt);
    setStaff((prev: any[]) => prev.map(s => (s.id === acc.id ? { ...s, salt, hash, localReset: true } : s)));
    setFails({ count: 0, until: 0 });
    enter(acc, 'owner');
  }); };

  const field = 'w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 mt-1 focus:outline-none focus:border-amber-500';
  const label = 'text-xs font-bold text-slate-400';
  const primary = 'w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-extrabold text-sm rounded-2xl transition-colors';
  const link = 'text-xs text-amber-400 hover:underline';
  const firstRun = !supabase && staff.length === 0;

  const seg = (title: string, options: [string, string][], value: string, onChange: (v: string) => void) => (
    <div>
      <p className={label + ' mb-1'}>{title}</p>
      <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-sm font-bold">
        {options.map(([id, text]) => (
          <button type="button" key={id} onClick={() => onChange(id)}
            className={`flex-1 py-2 rounded-lg transition-all ${value === id ? (id === 'retail' ? 'bg-indigo-500 text-white' : 'bg-amber-500 text-slate-950') : 'text-slate-400 hover:text-slate-200'}`}>{text}</button>
        ))}
      </div>
    </div>
  );
  const workspacePicker = seg('Workspace', [['bar', 'Bar'], ['retail', 'Wholesale']], workspace, setWorkspace);
  const rolePicker = seg('Sign in as', [['staff', 'Staff'], ['owner', 'Owner']], asRole, setAsRole);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 relative">
      <button onClick={onToggleTheme} className="absolute top-4 right-4 p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-100" title="Toggle light/dark">
        {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>

      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-7 shadow-2xl space-y-5">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center text-white shadow-lg"><Zap className="h-6 w-6" /></div>
          <div>
            <h1 className="font-extrabold text-xl tracking-wide">{bizName || <>{BRAND.lead}<span className="text-amber-400">{BRAND.tail}</span></>}</h1>
            <p className="text-xs text-slate-400">{firstRun ? 'Create the owner account' : screen === 'recover' ? 'Reset your password' : 'Sign in to continue'}</p>
          </div>
        </div>

        {workspacePicker}
        {!firstRun && rolePicker}

        {firstRun && (
          <form onSubmit={setupOwner} className="space-y-3">
            <div><label className={label}>Your name</label><input className={field} value={name} onChange={e => setName(e.target.value)} required /></div>
            <div><label className={label}>Email</label><input className={field} type="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
            <div><label className={label}>Password</label><PasswordInput className={field} value={password} onChange={e => setPassword(e.target.value)} required /></div>
            <button className={primary} disabled={busy}>Create owner account</button>
            <p className="text-[11px] text-slate-500">Accounts are saved on this device.</p>
          </form>
        )}

        {!firstRun && screen === 'login' && (
          <form onSubmit={login} className="space-y-3">
            <div><label className={label}>Email</label><input className={field} type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></div>
            <div><label className={label}>Password</label><PasswordInput className={field} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
            <button className={primary} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
            <button type="button" className={link} onClick={() => { setScreen('recover'); setStage('email'); setMethod(supabase ? 'email' : 'owner'); setMsg(''); setInfo(''); setPassword(''); setCode(''); }}>Forgot password?</button>
          </form>
        )}

        {!firstRun && screen === 'recover' && (
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-bold">
            {supabase && (
              <button type="button" onClick={() => { setMethod('email'); setMsg(''); setInfo(''); }}
                className={`flex-1 py-2 rounded-lg ${method === 'email' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'}`}>Email code</button>
            )}
            <button type="button" onClick={() => { setMethod('owner'); setMsg(''); setInfo(''); }}
              className={`flex-1 py-2 rounded-lg ${method === 'owner' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'}`}>Owner recovery code</button>
          </div>
        )}

        {!firstRun && screen === 'recover' && method === 'owner' && (
          <form onSubmit={ownerRecover} className="space-y-3">
            <div><label className={label}>Owner email</label><input className={field} type="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
            <div><label className={label}>Owner recovery code</label><input className={field + ' tracking-widest font-mono uppercase'} value={code} onChange={e => setCode(e.target.value)} required /></div>
            <div><label className={label}>New password</label><PasswordInput className={field} value={password} onChange={e => setPassword(e.target.value)} required /></div>
            <button className={primary} disabled={busy}>Reset owner password</button>
            <p className="text-[11px] text-slate-500">Works without internet. This changes the password on this device only. Use the email code to change the online password too.</p>
            <button type="button" className={link} onClick={() => setScreen('login')}>Back to sign in</button>
          </form>
        )}

        {!firstRun && screen === 'recover' && method === 'email' && stage === 'email' && (
          <form onSubmit={sendCode} className="space-y-3">
            <div><label className={label}>Account email</label><input className={field} type="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
            <button className={primary} disabled={busy}>Email me a code</button>
            <button type="button" className={link} onClick={() => setScreen('login')}>Back to sign in</button>
          </form>
        )}

        {!firstRun && screen === 'recover' && method === 'email' && stage === 'code' && (
          <form onSubmit={resetPassword} className="space-y-3">
            <div><label className={label}>6-digit code from email</label><input className={field + ' tracking-widest font-mono'} inputMode="numeric" value={code} onChange={e => setCode(e.target.value)} required /></div>
            <div><label className={label}>New password</label><PasswordInput className={field} value={password} onChange={e => setPassword(e.target.value)} required /></div>
            <button className={primary} disabled={busy}>Set password &amp; sign in</button>
            <button type="button" className={link} onClick={() => setStage('email')}>Send a new code</button>
          </form>
        )}

        {info && <p className="text-xs text-emerald-400">{info}</p>}
        {msg && <p className="text-xs text-rose-400 break-words">{msg}</p>}
        <p className="text-[11px] text-slate-500 text-center pt-2 border-t border-slate-800">
          {BRAND.product}
        </p>
      </div>
    </div>
  );
}
