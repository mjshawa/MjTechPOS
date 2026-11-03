import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const STORE_ID = (import.meta.env.VITE_STORE_ID as string | undefined) || 'bar-main';

/** null when no keys are configured: the app then simply runs offline-only. */
export const supabase = url && key
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;
