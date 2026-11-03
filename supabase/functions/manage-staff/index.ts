// Deploy:  npx supabase functions deploy manage-staff     (see README, "Staff accounts")
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided to every Edge Function automatically.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handle } from './handler.ts';

Deno.serve((req: Request) =>
  handle(req, {
    url: Deno.env.get('SUPABASE_URL')!,
    anonKey: Deno.env.get('SUPABASE_ANON_KEY')!,
    serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  }, createClient));
