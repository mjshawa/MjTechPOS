import React, { useEffect, useState } from 'react';
import PasswordInput from './PasswordInput';
import { X } from 'lucide-react';
import { supabase } from '../sync/supabase';
import { hashPassword, newSalt, uid } from './crypto';

/** Owner-only. Cloud mode: change roles of people who exist in Supabase. Local mode: add/remove staff on this device. */
export default function TeamModal({ auth, onClose }: { auth: any; onClose: () => void }) {
  const { user, staff, setStaff } = auth;
  const [profiles, setProfiles] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'staff' });

  const loadProfiles = async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from('profiles').select('id, email, name, role').order('email');
    if (error) setMsg(error.message); else setProfiles(data || []);
  };
  useEffect(() => { loadProfiles(); }, []);

  const setRole = async (id: string, role: string) => {
    const { error } = await supabase!.from('profiles').update({ role }).eq('id', id);
    setMsg(error ? error.message : 'Saved. The change will reach the other devices of that person when they next sign in with internet.');
    loadProfiles();
  };

  const addLocal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password.length < 6) { setMsg('Password must be at least 6 characters.'); return; }
    const salt = newSalt();
    const hash = await hashPassword(form.password, salt);
    setStaff((p: any[]) => [...p, { id: uid(), email: form.email.trim().toLowerCase(), name: form.name.trim(), role: form.role, salt, hash }]);
    setForm({ name: '', email: '', password: '', role: 'staff' });
    setMsg('Staff account added on this device.');
  };

  // Cloud mode: creating/removing logins needs the secret key, so it is done by the "manage-staff" Edge Function (owner only, checked on the server).
  const [busy, setBusy] = useState(false);
  const [cloudForm, setCloudForm] = useState({ name: '', email: '', password: '', role: 'staff' });
  const callFn = async (body: any) => {
    const { data, error } = await supabase!.functions.invoke('manage-staff', { body });
    if (error) {
      let m = error.message || 'Something went wrong.';
      try { const j = await (error as any).context.json(); if (j?.error) m = j.error; } catch { /* keep m */ }
      if (/not found|404|Failed to send|fetch/i.test(m) && !/account|email|owner|password/i.test(m)) m = 'The staff service is not available. Check the internet, or deploy the "manage-staff" function (see README, Staff accounts).';
      throw new Error(m);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  };
  const act = async (body: any, done: string) => {
    setBusy(true); setMsg('');
    try { await callFn(body); setMsg(done); await loadProfiles(); return true; }
    catch (e: any) { setMsg(e.message || String(e)); return false; }
    finally { setBusy(false); }
  };
  const addCloud = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cloudForm.password.length < 6) { setMsg('Password must be at least 6 characters.'); return; }
    if (await act({ action: 'create', ...cloudForm }, `${cloudForm.name || cloudForm.email} was added. They can sign in now.`)) setCloudForm({ name: '', email: '', password: '', role: 'staff' });
  };
  const removeCloud = (p: any) => {
    if (!window.confirm(`Remove ${p.name || p.email}?\n\nThey will not be able to sign in again. Their past sales stay in the records.`)) return;
    act({ action: 'delete', id: p.id }, `${p.name || p.email} was removed.`);
  };
  const renameCloud = (p: any) => {
    const n = window.prompt('Name to show for this person:', p.name || '');
    if (n && n.trim()) act({ action: 'update', id: p.id, name: n.trim() }, 'Name saved.');
  };
  const passwordCloud = (p: any) => {
    const pw = window.prompt(`New password for ${p.name || p.email} (at least 6 characters):`);
    if (pw) act({ action: 'update', id: p.id, password: pw }, 'Password changed. Tell them the new one.');
  };

  const input = 'bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500';

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-4 shadow-2xl text-slate-200">
        <div className="flex justify-between items-center">
          <h3 className="text-xl font-extrabold">Team</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X className="h-5 w-5" /></button>
        </div>
        <p className="text-xs text-slate-400">
          <b>Owner</b>: everything (stock, EOD, calendar, analytics, team). <b>Staff</b>: sell, open tabs, record expenses, issue refunds, view stock and sales (no costs, profit or End of Day).
        </p>

        {supabase ? (
          <>
            <div className="space-y-2">
              {profiles.map(p => (
                <div key={p.id} className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0"><p className="text-sm font-bold truncate">{p.name || p.email}</p><p className="text-xs text-slate-500 truncate">{p.email}</p></div>
                    <select disabled={p.id === user.id || busy} value={p.role} onChange={e => act({ action: 'update', id: p.id, role: e.target.value }, 'Role saved.')} className={input}>
                      <option value="staff">Staff</option><option value="owner">Owner</option>
                    </select>
                  </div>
                  <div className="flex gap-4 text-xs">
                    <button disabled={busy} onClick={() => renameCloud(p)} className="text-slate-400 hover:text-slate-200 hover:underline">Rename</button>
                    <button disabled={busy} onClick={() => passwordCloud(p)} className="text-slate-400 hover:text-slate-200 hover:underline">New password</button>
                    {p.id !== user.id && <button disabled={busy} onClick={() => removeCloud(p)} className="text-rose-400 hover:underline">Remove</button>}
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={addCloud} className="grid grid-cols-2 gap-2">
              <p className="col-span-2 text-xs font-bold text-slate-300">Add a person</p>
              <input className={input} placeholder="Name" value={cloudForm.name} onChange={e => setCloudForm({ ...cloudForm, name: e.target.value })} required />
              <input className={input} type="email" placeholder="Email" value={cloudForm.email} onChange={e => setCloudForm({ ...cloudForm, email: e.target.value })} required />
              <input className={input} type="text" placeholder="Password (6+ characters)" value={cloudForm.password} onChange={e => setCloudForm({ ...cloudForm, password: e.target.value })} required />
              <select className={input} value={cloudForm.role} onChange={e => setCloudForm({ ...cloudForm, role: e.target.value })}><option value="staff">Staff</option><option value="owner">Owner</option></select>
              <button disabled={busy} className="col-span-2 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-extrabold text-sm rounded-xl">{busy ? 'Please wait…' : 'Add account'}</button>
            </form>
            <p className="text-[11px] text-slate-500">The person signs in with this email and password (internet needed the first time on each device). A removed person is signed out of every device the next time it is online.</p>
          </>
        ) : (
          <>
            <div className="space-y-2">
              {staff.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between gap-3 bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                  <div className="min-w-0"><p className="text-sm font-bold truncate">{s.name}</p><p className="text-xs text-slate-500 truncate">{s.email} · {s.role}</p></div>
                  {s.id !== user.id && <button onClick={() => setStaff((p: any[]) => p.filter(x => x.id !== s.id))} className="text-xs text-rose-400 hover:underline">Remove</button>}
                </div>
              ))}
            </div>
            <form onSubmit={addLocal} className="grid grid-cols-2 gap-2">
              <input className={input} placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
              <input className={input} type="email" placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
              <PasswordInput className={input} placeholder="Password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required />
              <select className={input} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}><option value="staff">Staff</option><option value="owner">Owner</option></select>
              <button className="col-span-2 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-sm rounded-xl">Add account</button>
            </form>
          </>
        )}
        {msg && <p className="text-xs text-amber-400 break-words">{msg}</p>}
      </div>
    </div>
  );
}
