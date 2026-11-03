/**
 * Owner-only staff management for the POS. Runs on the server (Supabase Edge Function) because creating and deleting
 * login accounts needs the SECRET service-role key, which must never be inside the app.
 *
 * Request: POST { action: 'create' | 'update' | 'delete', ... }  with the signed-in user's token (Authorization header).
 *   create: { email, password, name, role? }       -> a confirmed login account + its profile
 *   update: { id, name?, role?, password? }        -> rename, change role, or set a new password
 *   delete: { id }                                 -> removes the login (cannot delete yourself or the last owner)
 * Only a user whose profile role is 'owner' is allowed. Everyone else gets 403.
 */
export interface Env { url: string; anonKey: string; serviceKey: string }
type MakeClient = (url: string, key: string, opts?: any) => any;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: any) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function handle(req: Request, env: Env, makeClient: MakeClient): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'Use POST.' });
  try {
    // 1. who is calling? (their own token, checked by Supabase)
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return reply(401, { error: 'Not signed in.' });
    const asCaller = makeClient(env.url, env.anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
    const { data: who, error: whoErr } = await asCaller.auth.getUser(token);
    if (whoErr || !who?.user) return reply(401, { error: 'Your sign-in has expired. Sign in again.' });
    const caller = who.user;

    // 2. are they an owner? (read with the service key so the answer cannot be faked)
    const admin = makeClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: me } = await admin.from('profiles').select('role').eq('id', caller.id).maybeSingle();
    if (me?.role !== 'owner') return reply(403, { error: 'Only the owner can manage staff.' });

    const body = await req.json().catch(() => ({}));
    const role = (r: any) => (r === 'owner' ? 'owner' : 'staff');

    if (body.action === 'create') {
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const name = String(body.name || '').trim() || email.split('@')[0];
      if (!EMAIL.test(email)) return reply(400, { error: 'That email address does not look right.' });
      if (password.length < 6) return reply(400, { error: 'Password must be at least 6 characters.' });
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
      if (error || !data?.user) return reply(400, { error: /already|registered|exists/i.test(error?.message || '') ? 'That email already has an account.' : (error?.message || 'Could not create the account.') });
      // the database trigger already made the profile (as staff); set the name and the role the owner picked
      const { error: pErr } = await admin.from('profiles').upsert({ id: data.user.id, email, name, role: role(body.role) }, { onConflict: 'id' });
      if (pErr) return reply(500, { error: 'Account created, but its profile could not be saved: ' + pErr.message });
      return reply(200, { ok: true, id: data.user.id });
    }

    if (body.action === 'update') {
      const id = String(body.id || '');
      if (!id) return reply(400, { error: 'Missing person.' });
      const patch: any = {};
      if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim();
      if (body.role !== undefined) {
        patch.role = role(body.role);
        if (id === caller.id && patch.role !== 'owner') return reply(400, { error: 'You cannot take the owner role away from yourself.' });
      }
      if (Object.keys(patch).length) {
        const { error } = await admin.from('profiles').update(patch).eq('id', id);
        if (error) return reply(500, { error: error.message });
      }
      if (body.password !== undefined) {
        if (String(body.password).length < 6) return reply(400, { error: 'Password must be at least 6 characters.' });
        const { error } = await admin.auth.admin.updateUserById(id, { password: String(body.password) });
        if (error) return reply(400, { error: error.message });
      }
      return reply(200, { ok: true });
    }

    if (body.action === 'delete') {
      const id = String(body.id || '');
      if (!id) return reply(400, { error: 'Missing person.' });
      if (id === caller.id) return reply(400, { error: 'You cannot remove your own account.' });
      const { data: target } = await admin.from('profiles').select('role').eq('id', id).maybeSingle();
      if (target?.role === 'owner') {
        const { data: owners } = await admin.from('profiles').select('id').eq('role', 'owner');
        if ((owners || []).length <= 1) return reply(400, { error: 'You cannot remove the last owner.' });
      }
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) return reply(400, { error: error.message });
      return reply(200, { ok: true });
    }

    return reply(400, { error: 'Unknown action.' });
  } catch (e: any) {
    return reply(500, { error: e?.message || String(e) });
  }
}
